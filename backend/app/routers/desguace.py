"""
Router para gestionar la base de datos de piezas del desguace
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func, Integer
from typing import Optional
from datetime import datetime, timedelta, timezone
import csv
import io
import json
import logging

from app.database import get_db
from app.models.busqueda import Usuario, EntornoTrabajo, BaseDesguace, PiezaDesguace, PiezaVendida, FichadaPieza, VerificacionFichada
from app.routers.auth import get_current_user
from utils.timezone import now_spain_naive

logger = logging.getLogger(__name__)

router = APIRouter()

# Campos disponibles para mapear
CAMPOS_DISPONIBLES = [
    {"id": "refid", "nombre": "Ref ID", "descripcion": "Referencia interna de la pieza"},
    {"id": "oem", "nombre": "OEM", "descripcion": "Referencia del fabricante original"},
    {"id": "oe", "nombre": "OE", "descripcion": "Referencia Original Equipment"},
    {"id": "iam", "nombre": "IAM", "descripcion": "Referencia Independent Aftermarket"},
    {"id": "precio", "nombre": "Precio", "descripcion": "Precio de venta"},
    {"id": "ubicacion", "nombre": "Ubicación", "descripcion": "Ubicación en almacén"},
    {"id": "observaciones", "nombre": "Observaciones", "descripcion": "Notas y observaciones"},
    {"id": "articulo", "nombre": "Artículo", "descripcion": "Nombre del artículo"},
    {"id": "marca", "nombre": "Marca", "descripcion": "Marca del vehículo"},
    {"id": "modelo", "nombre": "Modelo", "descripcion": "Modelo del vehículo"},
    {"id": "version", "nombre": "Versión", "descripcion": "Versión del vehículo"},
    {"id": "imagen", "nombre": "Imagen", "descripcion": "URL de la imagen"},
]

# Palabras clave para auto-detectar columnas (campo -> lista de posibles nombres)
# NOTA: "ref.pieza" se detecta para formato combinado, NO para OEM directo
KEYWORDS_MAPEO = {
    "refid": ["refid", "ref_id", "ref.id", "referencia", "codigo", "code", "id", "sku", "reference"],
    "oem": ["oem", "ref_oem", "refoem", "fabricante", "manufacturer"],
    "oe": ["oe", "original", "original_equipment"],
    "iam": ["iam", "aftermarket", "independent"],
    "precio": ["precio", "price", "pvp", "coste", "cost", "importe", "valor", "euro", "eur"],
    "ubicacion": ["ubicacion", "ubicación", "location", "almacen", "almacén", "estante", "posicion", "posición", "sitio"],
    "observaciones": ["observaciones", "observacion", "notas", "nota", "comentario", "comentarios", "descripcion", "descripción", "description", "obs"],
    "articulo": ["articulo", "artículo", "nombre", "name", "producto", "product", "denominacion", "denominación", "titulo", "título"],
    "marca": ["marca", "brand", "fabricante_vehiculo", "make"],
    "modelo": ["modelo", "model", "vehiculo", "vehículo"],
    "version": ["version", "versión", "variante", "motor", "motorización", "motorizacion", "año", "year"],
    "imagen": ["imagen", "imagen1", "imagen_1", "image", "image1", "image_1", "foto", "foto1", "foto_1", "img", "img1", "img_1", "url_imagen", "picture", "photo", "imágenes"],
}

# Columnas que indican formato combinado OEM/OE/IAM
COLUMNAS_FORMATO_COMBINADO = ["ref.pieza", "refpieza", "ref_pieza", "referencias"]


def detectar_mapeo_automatico(columnas_csv: list) -> tuple:
    """
    Intenta detectar automáticamente qué columna del CSV corresponde a cada campo.
    Devuelve una tupla: (mapeo_sugerido, columna_combinada o None)
    """
    mapeo_sugerido = {}
    columnas_usadas = set()
    columna_combinada_detectada = None
    
    # Normalizar columnas CSV para comparación
    columnas_normalizadas = {col: col.lower().strip().replace(" ", "_").replace("-", "_") for col in columnas_csv}
    
    # Primero detectar si hay columna de formato combinado
    for col_original, col_normalizada in columnas_normalizadas.items():
        if col_normalizada in COLUMNAS_FORMATO_COMBINADO:
            columna_combinada_detectada = col_original
            columnas_usadas.add(col_original)  # Marcar como usada para que no se mapee a otro campo
            break
    
    for campo_id, keywords in KEYWORDS_MAPEO.items():
        mejor_match = None
        
        for col_original, col_normalizada in columnas_normalizadas.items():
            if col_original in columnas_usadas:
                continue
                
            # Buscar coincidencia exacta primero
            if col_normalizada in keywords:
                mejor_match = col_original
                break
            
            # Buscar si alguna keyword está contenida en el nombre de la columna
            for keyword in keywords:
                if keyword in col_normalizada or col_normalizada in keyword:
                    mejor_match = col_original
                    break
            
            if mejor_match:
                break
        
        if mejor_match:
            mapeo_sugerido[campo_id] = mejor_match
            columnas_usadas.add(mejor_match)
        else:
            mapeo_sugerido[campo_id] = ""
    
    return mapeo_sugerido, columna_combinada_detectada


def get_current_admin_or_higher(
    usuario_actual: Usuario = Depends(get_current_user)
) -> Usuario:
    """Verificar que el usuario sea al menos admin"""
    if usuario_actual.rol not in ["sysowner", "owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo administradores o superiores pueden gestionar la base de datos",
        )
    return usuario_actual


@router.get("/campos")
async def obtener_campos_disponibles():
    """Obtener la lista de campos disponibles para mapear"""
    return {"campos": CAMPOS_DISPONIBLES}


@router.post("/analizar")
async def analizar_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_admin_or_higher)
):
    """
    Analizar un CSV y devolver las columnas detectadas.
    Este endpoint no guarda nada, solo lee las columnas del CSV.
    """
    try:
        # Verificar que es un CSV
        if not file.filename.endswith('.csv'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Solo se permiten archivos CSV",
            )
        
        # Leer el contenido del archivo
        content = await file.read()
        
        # Intentar decodificar con diferentes encodings
        decoded_content = None
        encoding_usado = None
        for encoding in ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']:
            try:
                decoded_content = content.decode(encoding)
                encoding_usado = encoding
                break
            except UnicodeDecodeError:
                continue
        
        if decoded_content is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se pudo leer el archivo. Encoding no soportado.",
            )
        
        # Detectar delimitador
        primera_linea = decoded_content.split('\n')[0]
        delimitador = ';' if ';' in primera_linea else ','
        
        # Parsear CSV
        csv_reader = csv.DictReader(io.StringIO(decoded_content), delimiter=delimitador)
        columnas = csv_reader.fieldnames
        
        if not columnas:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se pudieron detectar las columnas del CSV",
            )
        
        # Contar filas
        filas = list(csv_reader)
        total_filas = len(filas)
        
        # Muestra de datos (primeras 3 filas)
        muestra = []
        for i, fila in enumerate(filas[:3]):
            muestra.append({col: fila.get(col, '') for col in columnas})
        
# Detectar mapeo automático y columna combinada
        mapeo_sugerido, columna_combinada_detectada = detectar_mapeo_automatico(list(columnas))
        campos_detectados = sum(1 for v in mapeo_sugerido.values() if v)
        
        # Detectar si se debe usar formato combinado automáticamente
        usar_formato_combinado = columna_combinada_detectada is not None

        return {
            "archivo": file.filename,
            "encoding": encoding_usado,
            "delimitador": delimitador,
            "columnas": list(columnas),
            "total_filas": total_filas,
            "muestra": muestra,
            "campos_disponibles": CAMPOS_DISPONIBLES,
            "mapeo_sugerido": mapeo_sugerido,
            "campos_detectados": campos_detectados,
            "formato_combinado_detectado": usar_formato_combinado,
            "columna_combinada_detectada": columna_combinada_detectada,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analizando CSV: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al analizar el archivo: {str(e)}",
        )


@router.post("/upload")
async def subir_base_desguace(
    file: UploadFile = File(...),
    mapeo: str = Form(...),  # JSON con el mapeo de columnas
    entorno_id: Optional[int] = Form(None),
    formato_combinado: Optional[str] = Form(None),  # 'true' si OEM/OE/IAM están combinadas
    columna_combinada: Optional[str] = Form(None),  # Nombre de la columna con formato OEM/OE/IAM
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_admin_or_higher)
):
    """
    Subir un CSV con la base de datos de piezas del desguace.
    Requiere un mapeo de columnas del CSV a los campos de la BD.
    
    Si formato_combinado='true' y columna_combinada está definida,
    separa la columna por '/' asignando:
    - Parte 1 -> OEM
    - Parte 2 -> OE
    - Parte 3 -> IAM (puede contener comas para múltiples referencias)
    """
    try:
        # Parsear mapeo
        try:
            mapeo_dict = json.loads(mapeo)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El mapeo de columnas no es válido",
            )
        
        # Verificar si se usa formato combinado
        usar_formato_combinado = formato_combinado == 'true' and columna_combinada
        if usar_formato_combinado:
            logger.info(f"Usando formato combinado OEM/OE/IAM desde columna: {columna_combinada}")
        
        # Determinar el entorno de trabajo
        if usuario_actual.rol == "sysowner":
            if not entorno_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Sysowner debe especificar el entorno_id",
                )
            target_entorno_id = entorno_id
        else:
            if not usuario_actual.entorno_trabajo_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Usuario no tiene entorno asignado",
                )
            target_entorno_id = usuario_actual.entorno_trabajo_id
        
        # Verificar que el entorno existe
        entorno = db.query(EntornoTrabajo).filter(EntornoTrabajo.id == target_entorno_id).first()
        if not entorno:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Entorno no encontrado",
            )
        
        # Verificar que es un CSV
        if not file.filename.endswith('.csv'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Solo se permiten archivos CSV",
            )
        
        # Leer el contenido del archivo
        content = await file.read()
        
        # Intentar decodificar con diferentes encodings
        decoded_content = None
        for encoding in ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']:
            try:
                decoded_content = content.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        
        if decoded_content is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se pudo leer el archivo. Encoding no soportado.",
            )
        
        # Detectar delimitador
        primera_linea = decoded_content.split('\n')[0]
        delimitador = ';' if ';' in primera_linea else ','
        
        # Parsear CSV
        csv_reader = csv.DictReader(io.StringIO(decoded_content), delimiter=delimitador)
        columnas = csv_reader.fieldnames
        
        if not columnas:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se pudieron detectar las columnas del CSV",
            )
        
        # Leer todas las filas
        filas = list(csv_reader)
        
        if len(filas) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El CSV está vacío",
            )
        
        # Obtener piezas anteriores para comparar
        base_anterior = db.query(BaseDesguace).filter(
            BaseDesguace.entorno_trabajo_id == target_entorno_id
        ).first()
        
        piezas_anteriores = {}
        fichajes_anteriores = {}  # Guardar fechas de fichaje para preservarlas
        archivo_origen = None
        if base_anterior:
            archivo_origen = base_anterior.nombre_archivo
            # Guardar piezas anteriores indexadas por refid (o combinación única)
            for p in base_anterior.piezas:
                # Usar refid como clave principal, o combinación si no hay refid
                clave = p.refid or f"{p.oem}_{p.articulo}_{p.marca}_{p.modelo}"
                if clave:
                    piezas_anteriores[clave] = p
                    # Guardar fecha de fichaje si existe
                    if p.fecha_fichaje or p.usuario_fichaje_id:
                        fichajes_anteriores[clave] = {
                            "fecha_fichaje": p.fecha_fichaje,
                            "usuario_fichaje_id": p.usuario_fichaje_id
                        }
        
        # Crear set de referencias del nuevo CSV
        nuevas_referencias = set()
        for fila in filas:
            # Obtener la referencia según el mapeo
            ref_columna = mapeo_dict.get("refid", "")
            if ref_columna and ref_columna in fila:
                ref_valor = fila[ref_columna].strip() if fila[ref_columna] else None
                if ref_valor:
                    nuevas_referencias.add(ref_valor)
            else:
                # Si se usa formato combinado, extraer OEM de la columna combinada
                if usar_formato_combinado and columna_combinada in fila:
                    valor_combinado = fila[columna_combinada].strip() if fila[columna_combinada] else ""
                    if valor_combinado:
                        partes = valor_combinado.split("/")
                        oem = partes[0].strip() if len(partes) >= 1 else ""
                        art_col = mapeo_dict.get("articulo", "")
                        marca_col = mapeo_dict.get("marca", "")
                        modelo_col = mapeo_dict.get("modelo", "")
                        
                        art = fila.get(art_col, "").strip() if art_col else ""
                        marca = fila.get(marca_col, "").strip() if marca_col else ""
                        modelo = fila.get(modelo_col, "").strip() if modelo_col else ""
                        
                        clave = f"{oem}_{art}_{marca}_{modelo}"
                        if clave != "___":
                            nuevas_referencias.add(clave)
                else:
                    # Si no hay refid ni formato combinado, usar combinación normal
                    oem_col = mapeo_dict.get("oem", "")
                    art_col = mapeo_dict.get("articulo", "")
                    marca_col = mapeo_dict.get("marca", "")
                    modelo_col = mapeo_dict.get("modelo", "")
                    
                    oem = fila.get(oem_col, "").strip() if oem_col else ""
                    art = fila.get(art_col, "").strip() if art_col else ""
                    marca = fila.get(marca_col, "").strip() if marca_col else ""
                    modelo = fila.get(modelo_col, "").strip() if modelo_col else ""
                    
                    clave = f"{oem}_{art}_{marca}_{modelo}"
                    if clave != "___":
                        nuevas_referencias.add(clave)
        
        # Detectar piezas vendidas (estaban antes, ya no están)
        piezas_vendidas_count = 0
        for clave, pieza in piezas_anteriores.items():
            if clave not in nuevas_referencias:
                # Esta pieza se vendió - guardar en historial
                pieza_vendida = PiezaVendida(
                    entorno_trabajo_id=target_entorno_id,
                    refid=pieza.refid,
                    oem=pieza.oem,
                    oe=pieza.oe,
                    iam=pieza.iam,
                    precio=pieza.precio,
                    ubicacion=pieza.ubicacion,
                    observaciones=pieza.observaciones,
                    articulo=pieza.articulo,
                    marca=pieza.marca,
                    modelo=pieza.modelo,
                    version=pieza.version,
                    imagen=pieza.imagen,
                    archivo_origen=archivo_origen,
                    fecha_fichaje=pieza.fecha_fichaje,
                    usuario_fichaje_id=pieza.usuario_fichaje_id,
                )
                db.add(pieza_vendida)
                piezas_vendidas_count += 1
        
        # ============ LÓGICA DE UPSERT: Actualizar existentes o insertar nuevas ============
        # Crear/actualizar base de datos
        if base_anterior:
            # Actualizar metadata de la base existente
            base_anterior.nombre_archivo = file.filename
            base_anterior.total_piezas = len(filas)
            base_anterior.columnas = ",".join(columnas)
            base_anterior.mapeo_columnas = json.dumps(mapeo_dict)
            base_anterior.subido_por_id = usuario_actual.id
            base_anterior.fecha_subida = datetime.now(timezone.utc)
            base_desguace = base_anterior
            
            # Crear diccionario de piezas anteriores por refid para búsqueda rápida
            piezas_por_refid = {}
            for p in base_anterior.piezas:
                if p.refid:
                    piezas_por_refid[p.refid.strip().upper()] = p
        else:
            # Crear nueva base de datos
            base_desguace = BaseDesguace(
                entorno_trabajo_id=target_entorno_id,
                nombre_archivo=file.filename,
                total_piezas=len(filas),
                columnas=",".join(columnas),
                mapeo_columnas=json.dumps(mapeo_dict),
                subido_por_id=usuario_actual.id,
            )
            db.add(base_desguace)
            db.flush()  # Obtener ID
            piezas_por_refid = {}
        
        # Procesar piezas: actualizar existentes o insertar nuevas
        piezas_insertadas = 0
        piezas_actualizadas = 0
        refids_procesados = set()  # Para eliminar piezas que ya no están
        
        for fila in filas:
            try:
                pieza_data = {}
                
                # Si se usa formato combinado, procesar primero la columna combinada
                if usar_formato_combinado and columna_combinada in fila:
                    valor_combinado = fila[columna_combinada].strip() if fila[columna_combinada] else ""
                    if valor_combinado:
                        # Separar por "/" para obtener OEM/OE/IAM
                        partes = valor_combinado.split("/")
                        if len(partes) >= 1:
                            pieza_data["oem"] = partes[0].strip() if partes[0].strip() else None
                        if len(partes) >= 2:
                            pieza_data["oe"] = partes[1].strip() if partes[1].strip() else None
                        if len(partes) >= 3:
                            # IAM puede tener múltiples valores separados por coma o más "/"
                            # Unimos todo lo que queda después del segundo "/"
                            iam_completo = "/".join(partes[2:]).strip()
                            pieza_data["iam"] = iam_completo if iam_completo else None
                
                # Aplicar mapeo normal para los demás campos
                for campo, columna_csv in mapeo_dict.items():
                    # Si usamos formato combinado, NO sobrescribir oem, oe, iam
                    if usar_formato_combinado and campo in ["oem", "oe", "iam"]:
                        continue
                    
                    if columna_csv and columna_csv in fila:
                        valor = fila[columna_csv].strip() if fila[columna_csv] else None
                        
                        # Convertir precio a float
                        if campo == "precio" and valor:
                            try:
                                valor = float(valor.replace(',', '.').replace('€', '').replace('$', '').strip())
                            except:
                                valor = None
                        
                        pieza_data[campo] = valor
                
                # Obtener refid para buscar si existe
                refid = pieza_data.get("refid")
                if not refid:
                    # Sin refid, no podemos hacer upsert - insertar como nueva
                    pieza_data["base_desguace_id"] = base_desguace.id
                    # Preservar fichaje si existe
                    clave_pieza = f"{pieza_data.get('oem', '')}_{pieza_data.get('articulo', '')}_{pieza_data.get('marca', '')}_{pieza_data.get('modelo', '')}"
                    if clave_pieza in fichajes_anteriores:
                        pieza_data["fecha_fichaje"] = fichajes_anteriores[clave_pieza]["fecha_fichaje"]
                        pieza_data["usuario_fichaje_id"] = fichajes_anteriores[clave_pieza]["usuario_fichaje_id"]
                    pieza = PiezaDesguace(**pieza_data)
                    db.add(pieza)
                    piezas_insertadas += 1
                    continue
                
                refid_upper = refid.strip().upper()
                refids_procesados.add(refid_upper)
                
                # Buscar si ya existe
                pieza_existente = piezas_por_refid.get(refid_upper)
                
                if pieza_existente:
                    # ACTUALIZAR pieza existente - solo campos que cambiaron
                    campos_actualizables = ["oem", "oe", "iam", "precio", "ubicacion", 
                                           "observaciones", "articulo", "marca", "modelo", 
                                           "version", "imagen"]
                    hubo_cambios = False
                    for campo in campos_actualizables:
                        nuevo_valor = pieza_data.get(campo)
                        valor_actual = getattr(pieza_existente, campo, None)
                        if nuevo_valor != valor_actual:
                            setattr(pieza_existente, campo, nuevo_valor)
                            hubo_cambios = True
                    
                    if hubo_cambios:
                        piezas_actualizadas += 1
                else:
                    # INSERTAR nueva pieza
                    pieza_data["base_desguace_id"] = base_desguace.id
                    # Preservar fichaje si existe
                    if refid in fichajes_anteriores:
                        pieza_data["fecha_fichaje"] = fichajes_anteriores[refid]["fecha_fichaje"]
                        pieza_data["usuario_fichaje_id"] = fichajes_anteriores[refid]["usuario_fichaje_id"]
                    pieza = PiezaDesguace(**pieza_data)
                    db.add(pieza)
                    piezas_insertadas += 1
                
            except Exception as e:
                logger.warning(f"Error procesando fila: {e}")
                continue
        
        # Eliminar piezas que ya no están en el CSV (ya fueron movidas a vendidas arriba)
        if base_anterior:
            for clave, pieza in piezas_anteriores.items():
                if clave not in nuevas_referencias:
                    db.delete(pieza)
        
        # ============ VERIFICAR FICHADAS Y GUARDAR EN TABLA SEPARADA ============
        # Buscar TODAS las fichadas de este entorno (no solo las pendientes)
        todas_fichadas = db.query(FichadaPieza).filter(
            FichadaPieza.entorno_trabajo_id == target_entorno_id
        ).all()
        
        # Crear set de REFIDS reales de las piezas recién cargadas para verificación
        # (En lugar de usar nuevas_referencias que puede tener claves compuestas)
        refids_en_stock = set()
        for pieza in db.query(PiezaDesguace).filter(PiezaDesguace.base_desguace_id == base_desguace.id).all():
            if pieza.refid:
                refids_en_stock.add(pieza.refid.strip().upper())
        
        # Crear set de REFIDS de piezas que alguna vez existieron (vendidas)
        refids_vendidas = set()
        for vendida in db.query(PiezaVendida).filter(PiezaVendida.entorno_trabajo_id == target_entorno_id).all():
            if vendida.refid:
                refids_vendidas.add(vendida.refid.strip().upper())
        
        # Crear diccionario de fichadas por refid para actualizar piezas
        fichadas_por_refid = {}
        for fichada in todas_fichadas:
            refid_upper = fichada.id_pieza.strip().upper()
            # Guardar la fichada más reciente si hay múltiples
            if refid_upper not in fichadas_por_refid or fichada.fecha_fichada > fichadas_por_refid[refid_upper].fecha_fichada:
                fichadas_por_refid[refid_upper] = fichada
        
        fichadas_verificadas = 0
        fichadas_encontradas = 0
        
        for fichada in todas_fichadas:
            refid_fichada = fichada.id_pieza.strip().upper()
            # Buscar si la pieza está en stock ACTUAL o si alguna vez estuvo (vendida)
            # Si alguna vez estuvo en la base, se considera "encontrada"
            pieza_encontrada = refid_fichada in refids_en_stock or refid_fichada in refids_vendidas
            
            # Crear registro de verificación en tabla separada
            verificacion = VerificacionFichada(
                fichada_id=fichada.id,
                usuario_id=fichada.usuario_id,
                entorno_trabajo_id=fichada.entorno_trabajo_id,
                id_pieza=fichada.id_pieza,
                hora_fichada=fichada.fecha_fichada,
                en_stock=pieza_encontrada,
            )
            db.add(verificacion)
            
            fichadas_verificadas += 1
            if pieza_encontrada:
                fichadas_encontradas += 1
        
        # ============ ACTUALIZAR PIEZAS CON DATOS DE FICHAJE ============
        # Buscar piezas que coincidan con fichadas y actualizar fecha_fichaje y usuario_fichaje_id
        piezas_actualizadas_fichaje = 0
        for pieza in db.query(PiezaDesguace).filter(PiezaDesguace.base_desguace_id == base_desguace.id).all():
            if pieza.refid:
                refid_upper = pieza.refid.strip().upper()
                if refid_upper in fichadas_por_refid:
                    fichada = fichadas_por_refid[refid_upper]
                    pieza.fecha_fichaje = fichada.fecha_fichada
                    pieza.usuario_fichaje_id = fichada.usuario_id
                    piezas_actualizadas_fichaje += 1
        
        db.commit()
        
        logger.info(f"Base de desguace subida: {file.filename} ({piezas_insertadas} nuevas, {piezas_actualizadas} actualizadas, {piezas_vendidas_count} vendidas, {fichadas_verificadas} fichadas verificadas, {fichadas_encontradas} encontradas, {piezas_actualizadas_fichaje} con datos de fichaje) por {usuario_actual.email}" + (f" [Formato combinado: {columna_combinada}]" if usar_formato_combinado else ""))
        
        return {
            "message": "Base de datos subida correctamente",
            "archivo": file.filename,
            "piezas_insertadas": piezas_insertadas,
            "piezas_actualizadas": piezas_actualizadas,
            "piezas_vendidas": piezas_vendidas_count,
            "fichadas_verificadas": fichadas_verificadas,
            "fichadas_encontradas": fichadas_encontradas,
            "columnas_csv": list(columnas),
            "mapeo_aplicado": mapeo_dict,
            "formato_combinado": usar_formato_combinado,
            "columna_combinada": columna_combinada if usar_formato_combinado else None,
            "entorno": entorno.nombre,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error subiendo base de desguace: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al procesar el archivo: {str(e)}",
        )


@router.get("/info")
async def obtener_info_base(
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user)
):
    """Obtener información de la base de datos del desguace del entorno"""
    try:
        # Determinar entorno
        if usuario_actual.rol == "sysowner" and entorno_id:
            target_entorno_id = entorno_id
        else:
            target_entorno_id = usuario_actual.entorno_trabajo_id
        
        if not target_entorno_id:
            return {"tiene_base": False, "mensaje": "No hay entorno asignado"}
        
        base = db.query(BaseDesguace).filter(
            BaseDesguace.entorno_trabajo_id == target_entorno_id
        ).first()
        
        if not base:
            return {"tiene_base": False}
        
        # Obtener usuario que subió
        subido_por = db.query(Usuario).filter(Usuario.id == base.subido_por_id).first()
        
        # Parsear mapeo
        mapeo = {}
        if base.mapeo_columnas:
            try:
                mapeo = json.loads(base.mapeo_columnas)
            except:
                pass
        
        return {
            "tiene_base": True,
            "id": base.id,
            "nombre_archivo": base.nombre_archivo,
            "total_piezas": base.total_piezas,
            "columnas": base.columnas.split(",") if base.columnas else [],
            "mapeo_columnas": mapeo,
            "subido_por": subido_por.email if subido_por else "Desconocido",
            "fecha_subida": base.fecha_subida.isoformat() if base.fecha_subida else None,
            "fecha_actualizacion": base.fecha_actualizacion.isoformat() if base.fecha_actualizacion else None,
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo info base: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al obtener información",
        )


@router.delete("/eliminar")
async def eliminar_base_desguace(
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_admin_or_higher)
):
    """Eliminar la base de datos del desguace"""
    try:
        # Determinar entorno
        if usuario_actual.rol == "sysowner" and entorno_id:
            target_entorno_id = entorno_id
        else:
            target_entorno_id = usuario_actual.entorno_trabajo_id
        
        if not target_entorno_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No hay entorno especificado",
            )
        
        base = db.query(BaseDesguace).filter(
            BaseDesguace.entorno_trabajo_id == target_entorno_id
        ).first()
        
        if not base:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No existe base de datos para este entorno",
            )
        
        nombre = base.nombre_archivo
        db.delete(base)
        db.commit()
        
        logger.info(f"Base de desguace eliminada: {nombre} por {usuario_actual.email}")
        
        return {"message": f"Base de datos '{nombre}' eliminada correctamente"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error eliminando base: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al eliminar base de datos",
        )


@router.get("/buscar")
async def buscar_pieza(
    referencia: str,
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user)
):
    """Buscar una pieza en la base de datos del desguace"""
    try:
        # Determinar entorno
        if usuario_actual.rol == "sysowner" and entorno_id:
            target_entorno_id = entorno_id
        else:
            target_entorno_id = usuario_actual.entorno_trabajo_id
        
        if not target_entorno_id:
            return {"encontrado": False, "mensaje": "No hay entorno asignado"}
        
        # Buscar base
        base = db.query(BaseDesguace).filter(
            BaseDesguace.entorno_trabajo_id == target_entorno_id
        ).first()
        
        if not base:
            return {"encontrado": False, "mensaje": "No hay base de datos cargada"}
        
        # Buscar pieza por refid, oem, oe o iam
        piezas = db.query(PiezaDesguace).filter(
            PiezaDesguace.base_desguace_id == base.id,
            (PiezaDesguace.refid.ilike(f"%{referencia}%")) |
            (PiezaDesguace.oem.ilike(f"%{referencia}%")) |
            (PiezaDesguace.oe.ilike(f"%{referencia}%")) |
            (PiezaDesguace.iam.ilike(f"%{referencia}%"))
        ).limit(50).all()
        
        if not piezas:
            return {"encontrado": False, "resultados": []}
        
        resultados = []
        for p in piezas:
            resultado = {
                "id": p.id,
                "refid": p.refid,
                "oem": p.oem,
                "oe": p.oe,
                "iam": p.iam,
                "precio": p.precio,
                "ubicacion": p.ubicacion,
                "observaciones": p.observaciones,
                "articulo": p.articulo,
                "marca": p.marca,
                "modelo": p.modelo,
                "version": p.version,
                "imagen": p.imagen,
            }
            resultados.append(resultado)
        
        return {
            "encontrado": True,
            "total": len(resultados),
            "resultados": resultados,
        }
        
    except Exception as e:
        logger.error(f"Error buscando pieza: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error en la búsqueda",
        )


# ============== HISTORIAL DE VENTAS ==============

@router.get("/ventas")
async def obtener_ventas(
    entorno_id: Optional[int] = None,
    busqueda: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user)
):
    """Obtener historial de piezas vendidas con búsqueda opcional"""
    try:
        from datetime import datetime
        from sqlalchemy import or_
        
        # Determinar entorno
        if usuario_actual.rol == "sysowner" and entorno_id:
            target_entorno_id = entorno_id
        else:
            target_entorno_id = usuario_actual.entorno_trabajo_id
        
        if not target_entorno_id:
            return {"ventas": [], "total": 0, "mensaje": "No hay entorno asignado"}
        
        # Query base
        query = db.query(PiezaVendida).filter(
            PiezaVendida.entorno_trabajo_id == target_entorno_id
        )
        
        # Filtro por búsqueda (refid, oem, oe, iam, articulo)
        if busqueda and busqueda.strip():
            termino = f"%{busqueda.strip()}%"
            query = query.filter(
                or_(
                    PiezaVendida.refid.ilike(termino),
                    PiezaVendida.oem.ilike(termino),
                    PiezaVendida.oe.ilike(termino),
                    PiezaVendida.iam.ilike(termino),
                    PiezaVendida.articulo.ilike(termino),
                    PiezaVendida.marca.ilike(termino),
                    PiezaVendida.modelo.ilike(termino),
                )
            )
        
        # Filtro por fechas
        if fecha_desde:
            try:
                desde = datetime.fromisoformat(fecha_desde.replace('Z', '+00:00'))
                query = query.filter(PiezaVendida.fecha_venta >= desde)
            except:
                pass
        
        if fecha_hasta:
            try:
                hasta = datetime.fromisoformat(fecha_hasta.replace('Z', '+00:00'))
                # Añadir 1 día para hacer el filtro inclusivo (hasta el final del día)
                from datetime import timedelta
                hasta = hasta + timedelta(days=1)
                query = query.filter(PiezaVendida.fecha_venta < hasta)
            except:
                pass
        
        # Contar total y sumar valor
        total = query.count()
        
        # Calcular valor total de todas las piezas filtradas (no solo la página)
        from sqlalchemy import func
        valor_total = db.query(func.sum(PiezaVendida.precio)).filter(
            PiezaVendida.id.in_(query.with_entities(PiezaVendida.id).subquery())
        ).scalar() or 0
        
        # Ordenar por fecha de venta (más recientes primero) y paginar
        ventas = query.order_by(PiezaVendida.fecha_venta.desc()).offset(offset).limit(limit).all()
        
        # Obtener información de usuarios que ficharon
        usuarios_fichaje = {}
        usuario_ids = [v.usuario_fichaje_id for v in ventas if v.usuario_fichaje_id]
        if usuario_ids:
            usuarios = db.query(Usuario).filter(Usuario.id.in_(usuario_ids)).all()
            usuarios_fichaje = {u.id: (u.nombre or u.email) for u in usuarios}
        
        resultados = []
        for v in ventas:
            # Calcular días de rotación (desde fichaje o creación hasta venta)
            dias_rotacion = None
            if v.fecha_venta:
                fecha_entrada = v.fecha_fichaje  # Prioridad al fichaje
                if fecha_entrada and v.fecha_venta:
                    delta = v.fecha_venta - fecha_entrada
                    dias_rotacion = delta.days
            
            resultados.append({
                "id": v.id,
                "refid": v.refid,
                "oem": v.oem,
                "oe": v.oe,
                "iam": v.iam,
                "precio": v.precio,
                "ubicacion": v.ubicacion,
                "observaciones": v.observaciones,
                "articulo": v.articulo,
                "marca": v.marca,
                "modelo": v.modelo,
                "version": v.version,
                "imagen": v.imagen,
                "fecha_venta": v.fecha_venta.isoformat() if v.fecha_venta else None,
                "archivo_origen": v.archivo_origen,
                "fecha_fichaje": v.fecha_fichaje.isoformat() if v.fecha_fichaje else None,
                "usuario_fichaje": usuarios_fichaje.get(v.usuario_fichaje_id) if v.usuario_fichaje_id else None,
                "dias_rotacion": dias_rotacion,
            })
        
        return {
            "ventas": resultados,
            "total": total,
            "valor_total": float(valor_total) if valor_total else 0,
            "limit": limit,
            "offset": offset,
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo ventas: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al obtener historial de ventas",
        )


@router.get("/ventas/resumen")
async def resumen_ventas(
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user)
):
    """Obtener resumen de ventas (total, por día, ingresos) - Solo sysowner y owner"""
    # Solo sysowner y owner pueden ver ingresos
    if usuario_actual.rol not in ["sysowner", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo propietarios pueden ver el resumen de ingresos",
        )
    try:
        from datetime import datetime, timedelta
        from sqlalchemy import func
        
        # Determinar entorno
        if usuario_actual.rol == "sysowner" and entorno_id:
            target_entorno_id = entorno_id
        else:
            target_entorno_id = usuario_actual.entorno_trabajo_id
        
        if not target_entorno_id:
            return {"mensaje": "No hay entorno asignado"}
        
        # Total de piezas vendidas
        total_vendidas = db.query(PiezaVendida).filter(
            PiezaVendida.entorno_trabajo_id == target_entorno_id
        ).count()
        
        # Ingresos totales (suma de precios)
        ingresos_totales = db.query(func.sum(PiezaVendida.precio)).filter(
            PiezaVendida.entorno_trabajo_id == target_entorno_id
        ).scalar() or 0
        
        # Ventas últimos 7 días
        hace_7_dias = now_spain_naive() - timedelta(days=7)
        ventas_7_dias = db.query(PiezaVendida).filter(
            PiezaVendida.entorno_trabajo_id == target_entorno_id,
            PiezaVendida.fecha_venta >= hace_7_dias
        ).count()
        
        ingresos_7_dias = db.query(func.sum(PiezaVendida.precio)).filter(
            PiezaVendida.entorno_trabajo_id == target_entorno_id,
            PiezaVendida.fecha_venta >= hace_7_dias
        ).scalar() or 0
        
        # Ventas últimos 30 días
        hace_30_dias = now_spain_naive() - timedelta(days=30)
        ventas_30_dias = db.query(PiezaVendida).filter(
            PiezaVendida.entorno_trabajo_id == target_entorno_id,
            PiezaVendida.fecha_venta >= hace_30_dias
        ).count()
        
        ingresos_30_dias = db.query(func.sum(PiezaVendida.precio)).filter(
            PiezaVendida.entorno_trabajo_id == target_entorno_id,
            PiezaVendida.fecha_venta >= hace_30_dias
        ).scalar() or 0
        
        return {
            "total_vendidas": total_vendidas,
            "ingresos_totales": round(ingresos_totales, 2),
            "ventas_7_dias": ventas_7_dias,
            "ingresos_7_dias": round(ingresos_7_dias, 2),
            "ventas_30_dias": ventas_30_dias,
            "ingresos_30_dias": round(ingresos_30_dias, 2),
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo resumen ventas: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al obtener resumen",
        )


@router.delete("/ventas/{venta_id}")
async def eliminar_venta(
    venta_id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_admin_or_higher)
):
    """Eliminar un registro de venta del historial"""
    try:
        venta = db.query(PiezaVendida).filter(PiezaVendida.id == venta_id).first()
        
        if not venta:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Venta no encontrada",
            )
        
        # Verificar permisos
        if usuario_actual.rol != "sysowner" and venta.entorno_trabajo_id != usuario_actual.entorno_trabajo_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para eliminar esta venta",
            )
        
        db.delete(venta)
        db.commit()
        
        return {"message": "Registro de venta eliminado"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error eliminando venta: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al eliminar venta",
        )


# ============== STOCK (PIEZAS EN INVENTARIO) ==============

@router.get("/stock")
async def obtener_stock(
    entorno_id: Optional[int] = None,
    busqueda: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user)
):
    """Obtener piezas en stock con búsqueda opcional"""
    try:
        from sqlalchemy import or_
        
        # Determinar entorno
        if usuario_actual.rol == "sysowner" and entorno_id:
            target_entorno_id = entorno_id
        else:
            target_entorno_id = usuario_actual.entorno_trabajo_id
        
        if not target_entorno_id:
            return {"piezas": [], "total": 0, "mensaje": "No hay entorno asignado"}
        
        # Buscar base del entorno
        base = db.query(BaseDesguace).filter(
            BaseDesguace.entorno_trabajo_id == target_entorno_id
        ).first()
        
        if not base:
            return {"piezas": [], "total": 0, "mensaje": "No hay base de datos cargada"}
        
        # Query base
        query = db.query(PiezaDesguace).filter(
            PiezaDesguace.base_desguace_id == base.id
        )
        
        # Filtro por búsqueda (refid, oem, oe, iam, articulo, marca, modelo)
        if busqueda and busqueda.strip():
            termino = f"%{busqueda.strip()}%"
            query = query.filter(
                or_(
                    PiezaDesguace.refid.ilike(termino),
                    PiezaDesguace.oem.ilike(termino),
                    PiezaDesguace.oe.ilike(termino),
                    PiezaDesguace.iam.ilike(termino),
                    PiezaDesguace.articulo.ilike(termino),
                    PiezaDesguace.marca.ilike(termino),
                    PiezaDesguace.modelo.ilike(termino),
                )
            )
        
        # Contar total
        total = query.count()
        
        # Ordenar y paginar
        piezas = query.order_by(PiezaDesguace.id.desc()).offset(offset).limit(limit).all()
        
        # Obtener información de usuarios que ficharon
        usuarios_fichaje = {}
        usuario_ids = [p.usuario_fichaje_id for p in piezas if p.usuario_fichaje_id]
        if usuario_ids:
            usuarios = db.query(Usuario).filter(Usuario.id.in_(usuario_ids)).all()
            usuarios_fichaje = {u.id: (u.nombre or u.email) for u in usuarios}
        
        resultados = []
        for p in piezas:
            resultados.append({
                "id": p.id,
                "refid": p.refid,
                "oem": p.oem,
                "oe": p.oe,
                "iam": p.iam,
                "precio": p.precio,
                "ubicacion": p.ubicacion,
                "observaciones": p.observaciones,
                "articulo": p.articulo,
                "marca": p.marca,
                "modelo": p.modelo,
                "version": p.version,
                "imagen": p.imagen,
                "fecha_creacion": p.fecha_creacion.isoformat() if p.fecha_creacion else None,
                "fecha_fichaje": p.fecha_fichaje.isoformat() if p.fecha_fichaje else None,
                "usuario_fichaje": usuarios_fichaje.get(p.usuario_fichaje_id) if p.usuario_fichaje_id else None,
            })
        
        return {
            "piezas": resultados,
            "total": total,
            "limit": limit,
            "offset": offset,
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo stock: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al obtener stock",
        )


@router.get("/stock/resumen")
async def resumen_stock(
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user)
):
    """Obtener resumen del stock (total piezas, valor total) - Solo sysowner y owner pueden ver valores"""
    try:
        from sqlalchemy import func
        
        # Determinar entorno
        if usuario_actual.rol == "sysowner" and entorno_id:
            target_entorno_id = entorno_id
        else:
            target_entorno_id = usuario_actual.entorno_trabajo_id
        
        if not target_entorno_id:
            return {"mensaje": "No hay entorno asignado"}
        
        # Buscar base del entorno
        base = db.query(BaseDesguace).filter(
            BaseDesguace.entorno_trabajo_id == target_entorno_id
        ).first()
        
        if not base:
            return {
                "tiene_base": False,
                "total_piezas": 0,
                "valor_total": 0,
                "piezas_con_precio": 0,
                "precio_medio": 0,
            }
        
        # Solo sysowner y owner pueden ver valores económicos
        puede_ver_valores = usuario_actual.rol in ["sysowner", "owner"]
        
        # Total de piezas en stock
        total_piezas = db.query(PiezaDesguace).filter(
            PiezaDesguace.base_desguace_id == base.id
        ).count()
        
        # Piezas con precio
        piezas_con_precio = db.query(PiezaDesguace).filter(
            PiezaDesguace.base_desguace_id == base.id,
            PiezaDesguace.precio.isnot(None),
            PiezaDesguace.precio > 0
        ).count()
        
        if puede_ver_valores:
            # Valor total del inventario (suma de precios)
            valor_total = db.query(func.sum(PiezaDesguace.precio)).filter(
                PiezaDesguace.base_desguace_id == base.id
            ).scalar() or 0
            
            # Precio medio
            precio_medio = db.query(func.avg(PiezaDesguace.precio)).filter(
                PiezaDesguace.base_desguace_id == base.id,
                PiezaDesguace.precio.isnot(None),
                PiezaDesguace.precio > 0
            ).scalar() or 0
        else:
            valor_total = None
            precio_medio = None
        
        return {
            "tiene_base": True,
            "nombre_archivo": base.nombre_archivo,
            "fecha_subida": base.fecha_subida.isoformat() if base.fecha_subida else None,
            "total_piezas": total_piezas,
            "piezas_con_precio": piezas_con_precio,
            "valor_total": round(valor_total, 2) if valor_total is not None else None,
            "precio_medio": round(precio_medio, 2) if precio_medio is not None else None,
            "puede_ver_valores": puede_ver_valores,
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo resumen stock: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al obtener resumen",
        )


# ============== ESTUDIO COCHES ==============

@router.get("/estudio-coches")
async def obtener_estudio_coches(
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user)
):
    """
    Obtener estadísticas de piezas agrupadas por marca y modelo.
    Solo accesible para admin, owner y sysowner.
    """
    # Verificar permisos
    if usuario_actual.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para acceder a esta sección"
        )
    
    try:
        from sqlalchemy import func
        
        # Determinar entorno
        if usuario_actual.rol == "sysowner" and entorno_id:
            target_entorno_id = entorno_id
        else:
            target_entorno_id = usuario_actual.entorno_trabajo_id
        
        if not target_entorno_id:
            return {"resumen_marcas": [], "detalle_coches": [], "mensaje": "No hay entorno asignado"}
        
        # Buscar base del entorno
        base = db.query(BaseDesguace).filter(
            BaseDesguace.entorno_trabajo_id == target_entorno_id
        ).first()
        
        if not base:
            return {"resumen_marcas": [], "detalle_coches": [], "mensaje": "No hay base de datos cargada"}
        
        # Obtener estadísticas por marca
        stats_marca = db.query(
            PiezaDesguace.marca,
            func.count(PiezaDesguace.id).label('total_piezas'),
            func.count(func.distinct(PiezaDesguace.modelo)).label('total_modelos'),
            func.sum(func.cast(PiezaDesguace.fecha_fichaje.isnot(None), Integer)).label('piezas_fichadas')
        ).filter(
            PiezaDesguace.base_desguace_id == base.id,
            PiezaDesguace.marca.isnot(None),
            PiezaDesguace.marca != ''
        ).group_by(PiezaDesguace.marca).all()
        
        # Obtener piezas vendidas por marca
        vendidas_por_marca = {}
        vendidas = db.query(
            PiezaVendida.marca,
            func.count(PiezaVendida.id).label('total')
        ).filter(
            PiezaVendida.entorno_trabajo_id == target_entorno_id,
            PiezaVendida.marca.isnot(None),
            PiezaVendida.marca != ''
        ).group_by(PiezaVendida.marca).all()
        
        for v in vendidas:
            vendidas_por_marca[v.marca] = v.total
        
        resumen_marcas = []
        for stat in stats_marca:
            resumen_marcas.append({
                "marca": stat.marca or "Sin marca",
                "total_modelos": stat.total_modelos or 0,
                "total_piezas": stat.total_piezas or 0,
                "piezas_fichadas": stat.piezas_fichadas or 0,
                "piezas_vendidas": vendidas_por_marca.get(stat.marca, 0)
            })
        
        # Ordenar por total de piezas
        resumen_marcas.sort(key=lambda x: x['total_piezas'], reverse=True)
        
        # Obtener detalle por marca y modelo
        stats_modelo = db.query(
            PiezaDesguace.marca,
            PiezaDesguace.modelo,
            func.count(PiezaDesguace.id).label('total_piezas'),
            func.sum(func.cast(PiezaDesguace.fecha_fichaje.isnot(None), Integer)).label('piezas_fichadas')
        ).filter(
            PiezaDesguace.base_desguace_id == base.id,
            PiezaDesguace.marca.isnot(None),
            PiezaDesguace.marca != '',
            PiezaDesguace.modelo.isnot(None),
            PiezaDesguace.modelo != ''
        ).group_by(PiezaDesguace.marca, PiezaDesguace.modelo).all()
        
        # Obtener vendidas por modelo
        vendidas_por_modelo = {}
        vendidas_modelo = db.query(
            PiezaVendida.marca,
            PiezaVendida.modelo,
            func.count(PiezaVendida.id).label('total')
        ).filter(
            PiezaVendida.entorno_trabajo_id == target_entorno_id,
            PiezaVendida.marca.isnot(None),
            PiezaVendida.modelo.isnot(None)
        ).group_by(PiezaVendida.marca, PiezaVendida.modelo).all()
        
        for v in vendidas_modelo:
            key = f"{v.marca}|{v.modelo}"
            vendidas_por_modelo[key] = v.total
        
        detalle_coches = []
        for stat in stats_modelo:
            total = stat.total_piezas or 0
            fichadas = stat.piezas_fichadas or 0
            key = f"{stat.marca}|{stat.modelo}"
            vendidas = vendidas_por_modelo.get(key, 0)
            
            detalle_coches.append({
                "marca": stat.marca or "Sin marca",
                "modelo": stat.modelo or "Sin modelo",
                "total_piezas": total,
                "piezas_fichadas": fichadas,
                "piezas_vendidas": vendidas,
                "porcentaje_fichado": (fichadas / total * 100) if total > 0 else 0
            })
        
        return {
            "resumen_marcas": resumen_marcas,
            "detalle_coches": detalle_coches
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo estudio de coches: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al obtener estadísticas: {str(e)}"
        )

@router.get("/estudio-coches/marcas")
async def obtener_marcas_estudio(
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user)
):
    """Obtener lista de marcas para el selector cascada."""
    if usuario_actual.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="Sin permisos")
    
    target_entorno_id = entorno_id if usuario_actual.rol == "sysowner" and entorno_id else usuario_actual.entorno_trabajo_id
    if not target_entorno_id:
        return {"marcas": []}
    
    base = db.query(BaseDesguace).filter(BaseDesguace.entorno_trabajo_id == target_entorno_id).first()
    if not base:
        return {"marcas": []}
    
    from sqlalchemy import func
    marcas = db.query(PiezaDesguace.marca).filter(
        PiezaDesguace.base_desguace_id == base.id,
        PiezaDesguace.marca.isnot(None),
        PiezaDesguace.marca != ''
    ).distinct().order_by(PiezaDesguace.marca).all()
    
    return {"marcas": [m[0] for m in marcas]}


@router.get("/estudio-coches/modelos")
async def obtener_modelos_estudio(
    marca: str,
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user)
):
    """Obtener modelos para una marca específica."""
    if usuario_actual.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="Sin permisos")
    
    target_entorno_id = entorno_id if usuario_actual.rol == "sysowner" and entorno_id else usuario_actual.entorno_trabajo_id
    if not target_entorno_id:
        return {"modelos": []}
    
    base = db.query(BaseDesguace).filter(BaseDesguace.entorno_trabajo_id == target_entorno_id).first()
    if not base:
        return {"modelos": []}
    
    from sqlalchemy import func
    modelos = db.query(PiezaDesguace.modelo).filter(
        PiezaDesguace.base_desguace_id == base.id,
        PiezaDesguace.marca == marca,
        PiezaDesguace.modelo.isnot(None),
        PiezaDesguace.modelo != ''
    ).distinct().order_by(PiezaDesguace.modelo).all()
    
    return {"modelos": [m[0] for m in modelos]}


@router.get("/estudio-coches/versiones")
async def obtener_versiones_estudio(
    marca: str,
    modelo: str,
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user)
):
    """Obtener versiones/años para una marca y modelo específicos."""
    if usuario_actual.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="Sin permisos")
    
    target_entorno_id = entorno_id if usuario_actual.rol == "sysowner" and entorno_id else usuario_actual.entorno_trabajo_id
    if not target_entorno_id:
        return {"versiones": []}
    
    base = db.query(BaseDesguace).filter(BaseDesguace.entorno_trabajo_id == target_entorno_id).first()
    if not base:
        return {"versiones": []}
    
    from sqlalchemy import func
    versiones = db.query(PiezaDesguace.version).filter(
        PiezaDesguace.base_desguace_id == base.id,
        PiezaDesguace.marca == marca,
        PiezaDesguace.modelo == modelo,
        PiezaDesguace.version.isnot(None),
        PiezaDesguace.version != ''
    ).distinct().order_by(PiezaDesguace.version).all()
    
    return {"versiones": [v[0] for v in versiones]}


@router.get("/estudio-coches/piezas")
async def obtener_piezas_estudio(
    marca: str,
    modelo: str,
    version: Optional[str] = None,
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user)
):
    """Obtener piezas de un vehículo específico con resumen de valores."""
    if usuario_actual.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="Sin permisos")
    
    target_entorno_id = entorno_id if usuario_actual.rol == "sysowner" and entorno_id else usuario_actual.entorno_trabajo_id
    if not target_entorno_id:
        return {"piezas": [], "resumen": None}
    
    base = db.query(BaseDesguace).filter(BaseDesguace.entorno_trabajo_id == target_entorno_id).first()
    if not base:
        return {"piezas": [], "resumen": None}
    
    from sqlalchemy import func
    
    # Query de piezas
    query = db.query(PiezaDesguace).filter(
        PiezaDesguace.base_desguace_id == base.id,
        PiezaDesguace.marca == marca,
        PiezaDesguace.modelo == modelo
    )
    if version:
        query = query.filter(PiezaDesguace.version == version)
    
    piezas_db = query.all()
    
    # Obtener cantidad de piezas vendidas para este vehículo (búsqueda flexible)
    query_vendidas = db.query(func.count(PiezaVendida.id)).filter(
        PiezaVendida.entorno_trabajo_id == target_entorno_id,
        PiezaVendida.marca == marca
    )
    # Buscar modelos que contengan el nombre del modelo (más flexible)
    if modelo:
        # Quitar paréntesis y códigos para comparar
        modelo_base = modelo.split('(')[0].strip() if '(' in modelo else modelo
        query_vendidas = query_vendidas.filter(
            PiezaVendida.modelo.ilike(f"%{modelo_base}%")
        )
    if version:
        query_vendidas = query_vendidas.filter(PiezaVendida.version == version)
    
    total_vendidas = query_vendidas.scalar() or 0
    
    # Calcular tiempo medio de venta (en días) - optimizado
    tiempo_medio_venta = None
    
    if total_vendidas > 1:
        # Reutilizar los filtros existentes para obtener fechas
        from datetime import datetime
        query_fechas = db.query(
            func.min(PiezaVendida.fecha_venta),
            func.max(PiezaVendida.fecha_venta)
        ).filter(
            PiezaVendida.entorno_trabajo_id == target_entorno_id,
            PiezaVendida.marca == marca
        )
        if modelo:
            query_fechas = query_fechas.filter(PiezaVendida.modelo.ilike(f"%{modelo_base}%"))
        if version:
            query_fechas = query_fechas.filter(PiezaVendida.version == version)
        
        fechas = query_fechas.first()
        if fechas[0] and fechas[1]:
            dias_totales = (fechas[1] - fechas[0]).days + 1
            if dias_totales > 0:
                tiempo_medio_venta = round(dias_totales / total_vendidas, 1)
    
    # Construir respuesta
    piezas = []
    total_piezas = len(piezas_db)
    piezas_fichadas = 0
    piezas_con_precio = 0
    valor_stock = 0.0
    
    # Clasificación por zonas del coche
    PIEZAS_FRONTAL = [
        'FARO', 'CAPO', 'PARAGOLPES DELANTERO', 'REJILLA DELANTERA', 'REJILLA PARAGOLPES',
        'ALETA DELANTERA', 'REFUERZO PARAGOLPES DELANTERO', 'SPOILER PARAGOLPES DELANTERO',
        'FARO ANTINIEBLA', 'PILOTO DELANTERO', 'TRAVESAÑO', 'RADIADOR',
        'CONDENSADOR', 'SOPORTE FARO', 'MOLDURAS DELANTERAS', 'PUNTERA PARAGOLPES DELANTERA',
        'MORRO', 'FRONTAL COMPLETO'
    ]
    PIEZAS_TRASERAS = [
        'PILOTO TRASERO', 'PARAGOLPES TRASERO', 'PORTON', 'MALETERO',
        'REFUERZO PARAGOLPES TRASERO', 'FARO ANTINIEBLA TRASERO',
        'SPOILER TRASERO', 'ALERON', 'MOLDURAS TRASERAS', 'PILOTO MATRICULA',
        'PILOTO MARCHA ATRAS', 'LUNA TRASERA', 'AMORTIGUADORES MALETERO',
        'PUNTERA PARAGOLPES TRASERA'
    ]
    PIEZAS_CARROCERIA = [
        'PUERTA DELANTERA', 'PUERTA TRASERA', 'RETROVISOR', 'ESPEJO', 
        'TECHO', 'ESTRIBO', 'LUNA LATERAL', 'CRISTAL LATERAL', 'PARABRISAS',
        'ALETA TRASERA'
    ]
    
    zonas = {
        'frontal': 0,
        'trasera': 0,
        'carroceria': 0,
        'mecanica': 0,
        'valor_frontal': 0.0,
        'valor_trasera': 0.0,
        'valor_carroceria': 0.0,
        'valor_mecanica': 0.0,
        'articulos_frontal': {},
        'articulos_trasera': {},
        'articulos_carroceria': {},
        'articulos_mecanica': {}
    }
    
    def clasificar_pieza(articulo: str) -> str:
        if not articulo:
            return 'mecanica'
        articulo_upper = articulo.upper()
        
        for keyword in PIEZAS_FRONTAL:
            if keyword in articulo_upper:
                return 'frontal'
        for keyword in PIEZAS_TRASERAS:
            if keyword in articulo_upper:
                return 'trasera'
        for keyword in PIEZAS_CARROCERIA:
            if keyword in articulo_upper:
                return 'carroceria'
        return 'mecanica'
    
    for p in piezas_db:
        precio_val = None
        if p.precio:
            try:
                precio_val = float(p.precio)
            except:
                pass
        
        fichada = p.fecha_fichaje is not None
        if fichada:
            piezas_fichadas += 1
        
        if precio_val and precio_val > 0:
            piezas_con_precio += 1
            valor_stock += precio_val
        
        # Clasificar por zona
        zona = clasificar_pieza(p.articulo)
        zonas[zona] += 1
        if precio_val and precio_val > 0:
            zonas[f'valor_{zona}'] += precio_val
        
        # Contar artículos por zona
        articulo_nombre = p.articulo or 'Sin nombre'
        if articulo_nombre not in zonas[f'articulos_{zona}']:
            zonas[f'articulos_{zona}'][articulo_nombre] = 0
        zonas[f'articulos_{zona}'][articulo_nombre] += 1
        
        piezas.append({
            "id": p.id,
            "refid": p.refid,
            "oem": p.oem,
            "articulo": p.articulo,
            "precio": precio_val,
            "precio_mercado": None,
            "imagen": p.imagen,
            "ubicacion": p.ubicacion,
            "fichada": fichada,
            "zona": zona
        })
    
    # Ordenar artículos por cantidad y formatear
    def formatear_articulos(articulos_dict):
        items = sorted(articulos_dict.items(), key=lambda x: x[1], reverse=True)
        return [{"nombre": k, "cantidad": v} for k, v in items]
    
    resumen = {
        "total_piezas": total_piezas,
        "piezas_con_precio": piezas_con_precio,
        "piezas_fichadas": piezas_fichadas,
        "piezas_vendidas": total_vendidas,
        "tiempo_medio_venta": tiempo_medio_venta,
        "valor_stock": round(valor_stock, 2),
        "valor_mercado": None,
        "zonas": {
            "frontal": zonas['frontal'],
            "trasera": zonas['trasera'],
            "carroceria": zonas['carroceria'],
            "mecanica": zonas['mecanica'],
            "valor_frontal": round(zonas['valor_frontal'], 2),
            "valor_trasera": round(zonas['valor_trasera'], 2),
            "valor_carroceria": round(zonas['valor_carroceria'], 2),
            "valor_mecanica": round(zonas['valor_mecanica'], 2),
            "articulos_frontal": formatear_articulos(zonas['articulos_frontal']),
            "articulos_trasera": formatear_articulos(zonas['articulos_trasera']),
            "articulos_carroceria": formatear_articulos(zonas['articulos_carroceria']),
            "articulos_mecanica": formatear_articulos(zonas['articulos_mecanica'])
        }
    }
    
    return {"piezas": piezas, "resumen": resumen}


@router.post("/estudio-coches/buscar-precios")
async def buscar_precios_mercado(
    marca: str,
    modelo: str,
    version: Optional[str] = None,
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user)
):
    """Buscar precios en internet para las piezas de un vehículo."""
    if usuario_actual.rol not in ['admin', 'owner', 'sysowner']:
        raise HTTPException(status_code=403, detail="Sin permisos")
    
    target_entorno_id = entorno_id if usuario_actual.rol == "sysowner" and entorno_id else usuario_actual.entorno_trabajo_id
    if not target_entorno_id:
        return {"piezas": [], "resumen": None, "piezas_actualizadas": 0}
    
    base = db.query(BaseDesguace).filter(BaseDesguace.entorno_trabajo_id == target_entorno_id).first()
    if not base:
        return {"piezas": [], "resumen": None, "piezas_actualizadas": 0}
    
    from sqlalchemy import func
    
    # Query de piezas
    query = db.query(PiezaDesguace).filter(
        PiezaDesguace.base_desguace_id == base.id,
        PiezaDesguace.marca == marca,
        PiezaDesguace.modelo == modelo
    )
    if version:
        query = query.filter(PiezaDesguace.version == version)
    
    piezas_db = query.all()
    
    # Obtener refids de piezas vendidas
    query_vendidas = db.query(PiezaVendida.refid).filter(
        PiezaVendida.entorno_trabajo_id == target_entorno_id,
        PiezaVendida.marca == marca,
        PiezaVendida.modelo == modelo
    )
    if version:
        query_vendidas = query_vendidas.filter(PiezaVendida.version == version)
    
    vendidas_refids = set([v[0] for v in query_vendidas.all()])
    
    # Intentar buscar precios en internet usando los scrapers
    piezas_actualizadas = 0
    piezas = []
    valor_stock = 0.0
    valor_mercado = 0.0
    piezas_fichadas = 0
    piezas_con_precio = 0
    
    try:
        from core.scraper_factory import ScraperFactory
        factory = ScraperFactory()
        scraper = factory.get_scraper("ecooparts")  # Usar ecooparts por defecto
        
        for p in piezas_db:
            precio_val = None
            precio_mercado_val = None
            
            if p.precio:
                try:
                    precio_val = float(p.precio)
                    valor_stock += precio_val
                    piezas_con_precio += 1
                except:
                    pass
            
            fichada = p.fecha_fichaje is not None
            if fichada:
                piezas_fichadas += 1
            
            # Buscar precio de mercado si tiene OEM
            if p.oem and scraper:
                try:
                    resultados = scraper.search(p.oem)
                    if resultados and len(resultados) > 0:
                        # Tomar el precio promedio de los primeros 5 resultados
                        precios = [r.get('precio', 0) for r in resultados[:5] if r.get('precio')]
                        if precios:
                            precio_mercado_val = sum(precios) / len(precios)
                            valor_mercado += precio_mercado_val
                            piezas_actualizadas += 1
                except Exception as e:
                    logger.debug(f"Error buscando precio para OEM {p.oem}: {e}")
            
            piezas.append({
                "id": p.id,
                "refid": p.refid,
                "oem": p.oem,
                "articulo": p.articulo,
                "precio": precio_val,
                "precio_mercado": round(precio_mercado_val, 2) if precio_mercado_val else None,
                "imagen": p.imagen,
                "ubicacion": p.ubicacion,
                "fichada": fichada
            })
    except Exception as e:
        logger.error(f"Error buscando precios de mercado: {e}")
        # Si falla el scraper, devolver las piezas sin precios de mercado
        for p in piezas_db:
            precio_val = None
            if p.precio:
                try:
                    precio_val = float(p.precio)
                    valor_stock += precio_val
                    piezas_con_precio += 1
                except:
                    pass
            
            fichada = p.fecha_fichaje is not None
            if fichada:
                piezas_fichadas += 1
            
            piezas.append({
                "id": p.id,
                "refid": p.refid,
                "oem": p.oem,
                "articulo": p.articulo,
                "precio": precio_val,
                "precio_mercado": None,
                "imagen": p.imagen,
                "ubicacion": p.ubicacion,
                "fichada": fichada
            })
    
    resumen = {
        "total_piezas": len(piezas_db),
        "piezas_con_precio": piezas_con_precio,
        "piezas_fichadas": piezas_fichadas,
        "piezas_vendidas": len(vendidas_refids),
        "valor_stock": round(valor_stock, 2),
        "valor_mercado": round(valor_mercado, 2) if valor_mercado > 0 else None
    }
    
    return {"piezas": piezas, "resumen": resumen, "piezas_actualizadas": piezas_actualizadas}