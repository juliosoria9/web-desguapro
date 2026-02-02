"""
Servicio de Importación Automática de CSV para MotoCoche
=========================================================

Este servicio importa automáticamente el archivo StockSeinto.csv
desde /var/uploads/csv/ cada 30 minutos.

Formato del CSV:
ref.id;ref.pieza;anostock;precio;peso;estado;ubicacion;observaciones;articulo;marca;modelo;versión;imágenes;imágenes2
"""
import os
import csv
import logging
from datetime import datetime
from typing import Optional, Dict, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import SessionLocal
from app.models.busqueda import BaseDesguace, PiezaDesguace, PiezaVendida, EntornoTrabajo, PiezaPedida
from utils.timezone import now_spain_naive

# Configurar logging
logger = logging.getLogger(__name__)

# Configuración de la importación
# La ruta se puede configurar con variable de entorno CSV_IMPORT_PATH
# Por defecto usa /var/uploads/csv/StockSeinto.csv (Linux) o busca en el directorio del backend (Windows)
CSV_PATH_DEFAULT_LINUX = "/var/uploads/csv/StockSeinto.csv"
CSV_PATH_DEFAULT_WINDOWS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "StockSeinto.csv")

# Usar variable de entorno si existe, sino detectar SO
CSV_PATH = os.environ.get("CSV_IMPORT_PATH", 
    CSV_PATH_DEFAULT_LINUX if os.name != 'nt' else CSV_PATH_DEFAULT_WINDOWS
)

MOTOCOCHE_ENTORNO_NOMBRE = "motocoche"  # Nombre del entorno de trabajo de MotoCoche

# Mapeo de columnas del CSV a campos de la base de datos
MAPEO_COLUMNAS = {
    "ref.id": "refid",
    "ref.pieza": "oem",
    "precio": "precio",
    "ubicacion": "ubicacion",
    "observaciones": "observaciones",
    "articulo": "articulo",
    "marca": "marca",
    "modelo": "modelo",
    "versión": "version",
    "imágenes": "imagen",
}


def obtener_entorno_motocoche(db: Session) -> Optional[int]:
    """
    Obtiene el ID del entorno de trabajo de MotoCoche.
    Busca por nombre 'motocoche' (case insensitive).
    """
    entorno = db.query(EntornoTrabajo).filter(
        func.lower(EntornoTrabajo.nombre).like(f"%motocoche%")
    ).first()
    
    if entorno:
        return entorno.id
    
    # Fallback: buscar por ID 1 si no encuentra por nombre
    entorno = db.query(EntornoTrabajo).filter(EntornoTrabajo.id == 1).first()
    if entorno:
        logger.warning(f"No se encontró entorno 'motocoche', usando entorno ID 1: {entorno.nombre}")
        return entorno.id
    
    return None


def leer_csv_stock(csv_path: str) -> Tuple[list, list]:
    """
    Lee el archivo CSV y devuelve las cabeceras y filas.
    Maneja el formato específico de StockSeinto.csv (separado por ;)
    """
    filas = []
    cabeceras = []
    
    with open(csv_path, 'r', encoding='utf-8', errors='replace') as f:
        # Detectar delimitador
        primera_linea = f.readline()
        f.seek(0)
        
        delimitador = ';' if ';' in primera_linea else ','
        
        reader = csv.reader(f, delimiter=delimitador)
        cabeceras = next(reader)
        
        # Limpiar cabeceras
        cabeceras = [c.strip().lower() for c in cabeceras]
        
        for fila in reader:
            if len(fila) >= len(cabeceras) / 2:  # Al menos la mitad de columnas
                filas.append(fila)
    
    return cabeceras, filas


def mapear_fila_a_pieza(cabeceras: list, fila: list) -> Dict:
    """
    Mapea una fila del CSV a un diccionario de campos de PiezaDesguace.
    Procesa ref.pieza como formato combinado OEM/OE/IAM separado por "/"
    """
    datos = {}
    
    for i, cabecera in enumerate(cabeceras):
        if i >= len(fila):
            continue
            
        valor = fila[i].strip() if fila[i] else None
        
        # Mapear columnas conocidas
        if cabecera == "ref.id":
            datos["refid"] = valor
        elif cabecera == "ref.pieza":
            # Formato combinado: OEM / OE / IAM
            if valor:
                partes = valor.split("/")
                datos["oem"] = partes[0].strip() if len(partes) >= 1 and partes[0].strip() else None
                datos["oe"] = partes[1].strip() if len(partes) >= 2 and partes[1].strip() else None
                if len(partes) >= 3:
                    # IAM puede tener múltiples valores
                    iam_completo = "/".join(partes[2:]).strip()
                    datos["iam"] = iam_completo if iam_completo else None
        elif cabecera == "precio":
            try:
                # Convertir precio (formato español con coma)
                if valor:
                    datos["precio"] = float(valor.replace(',', '.'))
            except (ValueError, TypeError):
                datos["precio"] = None
        elif cabecera == "ubicacion":
            datos["ubicacion"] = valor
        elif cabecera == "observaciones":
            datos["observaciones"] = valor
        elif cabecera == "articulo":
            datos["articulo"] = valor
        elif cabecera == "marca":
            datos["marca"] = valor
        elif cabecera == "modelo":
            datos["modelo"] = valor
        elif cabecera in ("versión", "version"):
            datos["version"] = valor
        elif cabecera in ("imágenes", "imagenes"):
            datos["imagen"] = valor
    
    return datos


def detectar_piezas_vendidas(
    db: Session,
    base_desguace_id: int,
    entorno_trabajo_id: int,
    nuevos_refids: set,
    max_porcentaje_vendidas: float = 20.0  # Máximo 20% del stock puede marcarse como vendido de golpe
) -> int:
    """
    Detecta piezas que ya no están en el CSV (vendidas) y las mueve al historial.
    Retorna el número de piezas detectadas como vendidas.
    
    PROTECCIÓN: Si se detecta más del max_porcentaje_vendidas% del stock como vendido,
    se asume que hay un error en el CSV y no se marca ninguna como vendida.
    """
    # Obtener IDs actuales en la BD
    piezas_actuales = db.query(PiezaDesguace.refid).filter(
        PiezaDesguace.base_desguace_id == base_desguace_id,
        PiezaDesguace.refid.isnot(None)
    ).all()
    
    ids_actuales = {p.refid for p in piezas_actuales if p.refid}
    total_actuales = len(ids_actuales)
    
    # Detectar IDs que ya no están
    ids_vendidas = ids_actuales - nuevos_refids
    
    # PROTECCIÓN: Si se van a marcar demasiadas piezas como vendidas, abortar
    if total_actuales > 0:
        porcentaje_vendidas = (len(ids_vendidas) / total_actuales) * 100
        if porcentaje_vendidas > max_porcentaje_vendidas:
            logger.warning(
                f"PROTECCIÓN ACTIVADA: Se iban a marcar {len(ids_vendidas)} piezas como vendidas "
                f"({porcentaje_vendidas:.1f}% del stock). Máximo permitido: {max_porcentaje_vendidas}%. "
                f"Esto podría indicar un CSV incompleto o corrupto. No se marcará ninguna como vendida."
            )
            return 0
    
    # Si el CSV tiene muy pocas piezas comparado con el stock, no procesar ventas
    if total_actuales > 1000 and len(nuevos_refids) < total_actuales * 0.5:
        logger.warning(
            f"PROTECCIÓN ACTIVADA: El CSV tiene {len(nuevos_refids)} piezas pero hay {total_actuales} en stock. "
            f"El CSV parece incompleto. No se procesarán ventas."
        )
        return 0
    
    contador_vendidas = 0
    for refid in ids_vendidas:
        # Obtener datos de la pieza antes de marcarla como vendida
        pieza = db.query(PiezaDesguace).filter(
            PiezaDesguace.base_desguace_id == base_desguace_id,
            PiezaDesguace.refid == refid
        ).first()
        
        if pieza:
            # Verificar si ya existe en vendidas
            existe = db.query(PiezaVendida).filter(
                PiezaVendida.entorno_trabajo_id == entorno_trabajo_id,
                PiezaVendida.refid == refid
            ).first()
            
            if not existe:
                # Crear registro de pieza vendida
                vendida = PiezaVendida(
                    entorno_trabajo_id=entorno_trabajo_id,
                    refid=pieza.refid,
                    oem=pieza.oem,
                    articulo=pieza.articulo,
                    precio=pieza.precio,
                    marca=pieza.marca,
                    modelo=pieza.modelo,
                    version=pieza.version,
                    fecha_venta=now_spain_naive(),
                    fecha_fichaje=pieza.fecha_fichaje if hasattr(pieza, 'fecha_fichaje') else None,
                    usuario_fichaje_id=pieza.usuario_fichaje_id if hasattr(pieza, 'usuario_fichaje_id') else None,
                )
                db.add(vendida)
                contador_vendidas += 1
    
    return contador_vendidas


def importar_csv_motocoche(csv_path: str = CSV_PATH) -> Dict:
    """
    Importa el CSV de MotoCoche a la base de datos.
    
    Returns:
        Dict con estadísticas de la importación
    """
    logger.info(f"[{datetime.now()}] Iniciando importación automática de CSV: {csv_path}")
    
    resultado = {
        "success": False,
        "archivo": csv_path,
        "piezas_importadas": 0,
        "piezas_actualizadas": 0,
        "piezas_vendidas": 0,
        "error": None
    }
    
    # Verificar si existe el archivo
    if not os.path.exists(csv_path):
        resultado["error"] = f"Archivo no encontrado: {csv_path}"
        logger.error(resultado["error"])
        return resultado
    
    db: Session = SessionLocal()
    try:
        # Obtener entorno de MotoCoche
        entorno_id = obtener_entorno_motocoche(db)
        if not entorno_id:
            resultado["error"] = "No se encontró el entorno de trabajo de MotoCoche"
            logger.error(resultado["error"])
            return resultado
        
        logger.info(f"Entorno de trabajo MotoCoche: ID {entorno_id}")
        
        # Leer CSV
        cabeceras, filas = leer_csv_stock(csv_path)
        logger.info(f"CSV leído: {len(filas)} filas, columnas: {cabeceras[:5]}...")
        
        # Obtener o crear BaseDesguace para este entorno
        base = db.query(BaseDesguace).filter(
            BaseDesguace.entorno_trabajo_id == entorno_id
        ).first()
        
        if not base:
            base = BaseDesguace(
                entorno_trabajo_id=entorno_id,
                nombre_archivo="StockSeinto.csv (auto)",
                total_piezas=0,
                columnas=",".join(cabeceras),
                fecha_subida=now_spain_naive()
            )
            db.add(base)
            db.flush()
            logger.info(f"Creada nueva BaseDesguace ID {base.id}")
        
        # Recopilar nuevos IDs para detectar vendidas
        nuevos_refids = set()
        
        # Indexar piezas existentes por refid para actualizaciones
        piezas_existentes = {}
        for pieza in db.query(PiezaDesguace).filter(
            PiezaDesguace.base_desguace_id == base.id
        ).all():
            if pieza.refid:
                piezas_existentes[pieza.refid] = pieza
        
        # Procesar filas
        piezas_nuevas = []
        actualizadas = 0
        
        for fila in filas:
            datos = mapear_fila_a_pieza(cabeceras, fila)
            refid = datos.get("refid")
            
            if refid:
                nuevos_refids.add(refid)
                
                if refid in piezas_existentes:
                    # Actualizar pieza existente
                    pieza = piezas_existentes[refid]
                    for campo, valor in datos.items():
                        if valor is not None:
                            setattr(pieza, campo, valor)
                    actualizadas += 1
                else:
                    # Nueva pieza
                    nueva = PiezaDesguace(
                        base_desguace_id=base.id,
                        **datos
                    )
                    piezas_nuevas.append(nueva)
        
        # Detectar piezas vendidas
        vendidas = detectar_piezas_vendidas(db, base.id, entorno_id, nuevos_refids)
        
        # Eliminar piezas que ya no están (vendidas)
        if vendidas > 0:
            ids_a_eliminar = set(piezas_existentes.keys()) - nuevos_refids
            db.query(PiezaDesguace).filter(
                PiezaDesguace.base_desguace_id == base.id,
                PiezaDesguace.refid.in_(ids_a_eliminar)
            ).delete(synchronize_session=False)
        
        # Insertar nuevas piezas
        db.bulk_save_objects(piezas_nuevas)
        
        # ========== MARCAR PIEZAS PEDIDAS COMO RECIBIDAS ==========
        # Si hay nuevas piezas, verificar si alguna estaba en la lista de pedidas
        piezas_recibidas = 0
        if piezas_nuevas:
            # Obtener los OEMs de las nuevas piezas
            oems_nuevos = set()
            for p in piezas_nuevas:
                if p.oem:
                    oems_nuevos.add(p.oem.strip().upper())
                if p.refid:
                    oems_nuevos.add(str(p.refid).strip().upper())
            
            # Buscar pedidas pendientes que coincidan
            if oems_nuevos:
                pedidas_pendientes = db.query(PiezaPedida).filter(
                    PiezaPedida.entorno_trabajo_id == entorno_id,
                    PiezaPedida.recibida == False
                ).all()
                
                for pedida in pedidas_pendientes:
                    ref_upper = pedida.referencia.strip().upper() if pedida.referencia else ""
                    if ref_upper in oems_nuevos:
                        pedida.recibida = True
                        pedida.fecha_recepcion = now_spain_naive()
                        piezas_recibidas += 1
                        logger.info(f"Pieza pedida '{pedida.referencia}' marcada como RECIBIDA")
        
        # Actualizar metadatos de la base
        base.total_piezas = len(nuevos_refids)
        base.fecha_subida = now_spain_naive()  # Actualizar fecha de última subida (incluso automática)
        base.fecha_actualizacion = now_spain_naive()
        base.nombre_archivo = "StockSeinto.csv (auto)"
        
        db.commit()
        
        resultado["success"] = True
        resultado["piezas_importadas"] = len(piezas_nuevas)
        resultado["piezas_actualizadas"] = actualizadas
        resultado["piezas_vendidas"] = vendidas
        resultado["piezas_recibidas"] = piezas_recibidas
        resultado["total_piezas"] = len(nuevos_refids)
        
        logger.info(f"[{datetime.now()}] Importación completada:")
        logger.info(f"  - Nuevas: {len(piezas_nuevas)}")
        logger.info(f"  - Actualizadas: {actualizadas}")
        logger.info(f"  - Vendidas detectadas: {vendidas}")
        logger.info(f"  - Pedidas recibidas: {piezas_recibidas}")
        logger.info(f"  - Total en stock: {len(nuevos_refids)}")
        
    except Exception as e:
        db.rollback()
        resultado["error"] = str(e)
        logger.error(f"Error en importación: {e}", exc_info=True)
    finally:
        db.close()
    
    return resultado


def ejecutar_importacion_programada():
    """
    Función wrapper para el scheduler.
    Se llama cada 30 minutos.
    """
    logger.info(f"[{datetime.now()}] Ejecutando importación programada de CSV MotoCoche...")
    resultado = importar_csv_motocoche()
    
    if resultado["success"]:
        logger.info(f"[{datetime.now()}] Importación programada completada exitosamente")
    else:
        logger.error(f"[{datetime.now()}] Error en importación programada: {resultado.get('error')}")
    
    return resultado


def limpiar_ventas_falsas() -> Dict:
    """
    Limpia las piezas falsamente marcadas como vendidas.
    Una pieza se considera "falsamente vendida" si su refid todavía existe en PiezaDesguace.
    
    Esta función se ejecuta periódicamente para corregir posibles errores
    en la detección de ventas.
    
    Returns:
        Dict con estadísticas de la limpieza
    """
    logger.info(f"[{datetime.now()}] Iniciando limpieza de ventas falsas...")
    
    resultado = {
        "success": False,
        "piezas_eliminadas": 0,
        "piezas_vendidas_antes": 0,
        "piezas_vendidas_despues": 0,
        "error": None
    }
    
    db = SessionLocal()
    
    try:
        # Contar vendidas antes
        resultado["piezas_vendidas_antes"] = db.query(PiezaVendida).count()
        
        # Obtener todos los refids de piezas en stock
        refids_stock = set(
            r[0] for r in db.query(PiezaDesguace.refid)
            .filter(PiezaDesguace.refid.isnot(None))
            .all()
        )
        
        # Obtener todas las piezas vendidas
        vendidas = db.query(PiezaVendida).all()
        
        # Eliminar las falsas vendidas (que aún existen en stock) en lotes
        eliminadas = 0
        batch_size = 5000
        
        for v in vendidas:
            if v.refid and v.refid in refids_stock:
                db.delete(v)
                eliminadas += 1
                
                # Commit por lotes para evitar problemas de memoria
                if eliminadas % batch_size == 0:
                    db.commit()
                    logger.info(f"  Limpieza en progreso: {eliminadas} eliminadas...")
        
        db.commit()
        
        # Contar vendidas después
        resultado["piezas_vendidas_despues"] = db.query(PiezaVendida).count()
        resultado["piezas_eliminadas"] = eliminadas
        resultado["success"] = True
        
        if eliminadas > 0:
            logger.info(
                f"[{datetime.now()}] Limpieza completada: {eliminadas} piezas falsas eliminadas. "
                f"Vendidas: {resultado['piezas_vendidas_antes']} -> {resultado['piezas_vendidas_despues']}"
            )
        else:
            logger.info(f"[{datetime.now()}] Limpieza completada: No se encontraron ventas falsas.")
        
    except Exception as e:
        db.rollback()
        resultado["error"] = str(e)
        logger.error(f"Error en limpieza de ventas falsas: {e}", exc_info=True)
    finally:
        db.close()
    
    return resultado


def ejecutar_limpieza_ventas_programada():
    """
    Función wrapper para el scheduler de limpieza.
    Se llama cada 6 horas.
    """
    logger.info(f"[{datetime.now()}] Ejecutando limpieza programada de ventas falsas...")
    resultado = limpiar_ventas_falsas()
    
    if resultado["success"]:
        logger.info(f"[{datetime.now()}] Limpieza programada completada: {resultado['piezas_eliminadas']} eliminadas")
    else:
        logger.error(f"[{datetime.now()}] Error en limpieza programada: {resultado.get('error')}")
    
    return resultado


# Para testing manual
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    resultado = importar_csv_motocoche()
    print(resultado)
