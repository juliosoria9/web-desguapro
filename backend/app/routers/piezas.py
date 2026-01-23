"""
Router para gestión y verificación de piezas
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from pydantic import BaseModel
from datetime import datetime
import logging
import io
import csv
import os
import json

from app.database import get_db
from app.models.busqueda import PiezaDesguace, BaseDesguace, CSVGuardado, PiezaPedida
from app.dependencies import get_current_user
from utils.security import TokenData
from utils.timezone import now_spain_naive

logger = logging.getLogger(__name__)
router = APIRouter()

# Directorio para guardar CSVs
CSV_STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "csv_storage")
os.makedirs(CSV_STORAGE_DIR, exist_ok=True)


# ============== SCHEMAS ==============
class PiezaNuevaInput(BaseModel):
    refid: Optional[str] = None
    oem: Optional[str] = None
    oe: Optional[str] = None
    iam: Optional[str] = None
    articulo: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    version: Optional[str] = None
    precio: Optional[float] = None
    ubicacion: Optional[str] = None
    observaciones: Optional[str] = None


class PiezasNuevasRequest(BaseModel):
    piezas: List[PiezaNuevaInput]


class PiezaResponse(BaseModel):
    id: int
    refid: Optional[str] = None
    oem: Optional[str] = None
    oe: Optional[str] = None
    iam: Optional[str] = None
    articulo: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    version: Optional[str] = None
    precio: Optional[float] = None
    ubicacion: Optional[str] = None
    observaciones: Optional[str] = None
    fecha_creacion: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============== ENDPOINTS ==============
@router.post("/nuevas")
async def crear_piezas_nuevas(
    request: PiezasNuevasRequest,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Crear una o más piezas nuevas en el inventario"""
    try:
        if not current_user.entorno_trabajo_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Usuario no tiene un entorno de trabajo asignado"
            )
        
        # Obtener o crear la base de desguace para este entorno
        base_desguace = db.query(BaseDesguace).filter(
            BaseDesguace.entorno_trabajo_id == current_user.entorno_trabajo_id
        ).first()
        
        if not base_desguace:
            # Crear una base de desguace si no existe
            base_desguace = BaseDesguace(
                entorno_trabajo_id=current_user.entorno_trabajo_id,
                nombre_archivo="piezas_manuales",
                total_piezas=0,
                fecha_subida=now_spain_naive(),
            )
            db.add(base_desguace)
            db.flush()
        
        piezas_insertadas = 0
        for pieza_data in request.piezas:
            # Validar que tenga al menos un campo identificador
            if not any([pieza_data.refid, pieza_data.oem, pieza_data.articulo]):
                continue
            
            nueva_pieza = PiezaDesguace(
                base_desguace_id=base_desguace.id,
                refid=pieza_data.refid.strip() if pieza_data.refid else None,
                oem=pieza_data.oem.strip() if pieza_data.oem else None,
                oe=pieza_data.oe.strip() if pieza_data.oe else None,
                iam=pieza_data.iam.strip() if pieza_data.iam else None,
                articulo=pieza_data.articulo.strip() if pieza_data.articulo else None,
                marca=pieza_data.marca.strip() if pieza_data.marca else None,
                modelo=pieza_data.modelo.strip() if pieza_data.modelo else None,
                version=pieza_data.version.strip() if pieza_data.version else None,
                precio=float(pieza_data.precio) if pieza_data.precio else None,
                ubicacion=pieza_data.ubicacion.strip() if pieza_data.ubicacion else None,
                observaciones=pieza_data.observaciones.strip() if pieza_data.observaciones else None,
                fecha_creacion=now_spain_naive(),
            )
            db.add(nueva_pieza)
            piezas_insertadas += 1
        
        # Actualizar contador de piezas en la base
        base_desguace.total_piezas = db.query(PiezaDesguace).filter(
            PiezaDesguace.base_desguace_id == base_desguace.id
        ).count() + piezas_insertadas
        
        db.commit()
        
        logger.info(f"Usuario {current_user.email} añadió {piezas_insertadas} piezas nuevas")
        
        return {
            "success": True,
            "insertadas": piezas_insertadas,
            "message": f"Se han añadido {piezas_insertadas} pieza(s) al inventario"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creando piezas: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al guardar las piezas: {str(e)}"
        )


@router.get("/recientes")
async def obtener_piezas_recientes(
    limit: int = 20,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Obtener las últimas piezas añadidas al inventario"""
    try:
        if not current_user.entorno_trabajo_id:
            return {"piezas": []}
        
        # Obtener base de desguace
        base_desguace = db.query(BaseDesguace).filter(
            BaseDesguace.entorno_trabajo_id == current_user.entorno_trabajo_id
        ).first()
        
        if not base_desguace:
            return {"piezas": []}
        
        # Obtener las últimas piezas
        piezas = db.query(PiezaDesguace).filter(
            PiezaDesguace.base_desguace_id == base_desguace.id
        ).order_by(
            PiezaDesguace.fecha_creacion.desc()
        ).limit(limit).all()
        
        return {
            "piezas": [
                {
                    "id": p.id,
                    "refid": p.refid,
                    "oem": p.oem,
                    "oe": p.oe,
                    "iam": p.iam,
                    "articulo": p.articulo,
                    "marca": p.marca,
                    "modelo": p.modelo,
                    "version": p.version,
                    "precio": p.precio,
                    "ubicacion": p.ubicacion,
                    "observaciones": p.observaciones,
                    "fecha_creacion": p.fecha_creacion.isoformat() if p.fecha_creacion else None,
                }
                for p in piezas
            ]
        }
        
    except Exception as e:
        logger.error(f"Error obteniendo piezas recientes: {e}")
        return {"piezas": []}


@router.delete("/{pieza_id}")
async def eliminar_pieza(
    pieza_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Eliminar una pieza del inventario"""
    try:
        if not current_user.entorno_trabajo_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Usuario no tiene un entorno de trabajo asignado"
            )
        
        # Verificar que la pieza pertenece al entorno del usuario
        pieza = db.query(PiezaDesguace).join(BaseDesguace).filter(
            PiezaDesguace.id == pieza_id,
            BaseDesguace.entorno_trabajo_id == current_user.entorno_trabajo_id
        ).first()
        
        if not pieza:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pieza no encontrada"
            )
        
        db.delete(pieza)
        db.commit()
        
        logger.info(f"Usuario {current_user.email} eliminó pieza {pieza_id}")
        
        return {"success": True, "message": "Pieza eliminada correctamente"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error eliminando pieza: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al eliminar la pieza: {str(e)}"
        )


@router.post("/verificar-csv")
async def verificar_piezas_csv(
    archivo: UploadFile = File(...),
    umbral_compra: int = Form(30),
    guardar: str = Form("false"),
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Verificar disponibilidad de piezas desde un archivo CSV.
    Formato esperado: OEM;Cantidad;OE;IAM;Precio;Observaciones;Imagen
    """
    try:
        if not current_user.entorno_trabajo_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Usuario no tiene un entorno de trabajo asignado"
            )
        
        # Leer el contenido del archivo
        content = await archivo.read()
        
        # Detectar encoding
        try:
            text = content.decode('utf-8')
        except UnicodeDecodeError:
            try:
                text = content.decode('latin-1')
            except:
                text = content.decode('cp1252', errors='ignore')
        
        # Guardar el CSV si se solicita
        if guardar.lower() == "true":
            try:
                import uuid
                nombre_archivo = archivo.filename or f"csv_{uuid.uuid4().hex[:8]}.csv"
                ruta_guardado = os.path.join(CSV_STORAGE_DIR, f"{current_user.entorno_trabajo_id}_{uuid.uuid4().hex[:8]}_{nombre_archivo}")
                
                with open(ruta_guardado, 'wb') as f:
                    f.write(content)
                
                # Registrar en BD
                csv_guardado = CSVGuardado(
                    entorno_trabajo_id=current_user.entorno_trabajo_id,
                    usuario_id=current_user.id,
                    nombre=nombre_archivo,
                    ruta_archivo=ruta_guardado,
                    total_piezas=0,  # Se actualiza después
                    fecha_subida=now_spain_naive()
                )
                db.add(csv_guardado)
                db.flush()
            except Exception as e:
                logger.error(f"Error guardando CSV: {e}")
        
        # Parsear CSV - formato: OEM;Cantidad;OE;IAM;Precio;Observaciones;Imagen
        lines = text.strip().split('\n')
        piezas_a_verificar = []
        
        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue
            
            # Saltar cabecera si existe
            lower_line = line.lower()
            if i == 0 and ('oem' in lower_line or 'referencia' in lower_line or 'cantidad' in lower_line):
                continue
            
            # Separar por ;
            parts = line.split(';')
            
            if len(parts) >= 2:
                referencia = parts[0].strip()
                try:
                    cantidad = int(parts[1].strip())
                except ValueError:
                    cantidad = 1
                
                # Columnas opcionales del CSV
                oe = parts[2].strip() if len(parts) > 2 else None
                iam = parts[3].strip() if len(parts) > 3 else None
                try:
                    precio_csv = float(parts[4].strip().replace(',', '.')) if len(parts) > 4 and parts[4].strip() else None
                except:
                    precio_csv = None
                observaciones = parts[5].strip() if len(parts) > 5 else None
                imagen = parts[6].strip() if len(parts) > 6 else None
                
                if referencia:
                    piezas_a_verificar.append({
                        'referencia': referencia,
                        'cantidad': cantidad,
                        'oe': oe,
                        'iam': iam,
                        'precio_csv': precio_csv,
                        'observaciones': observaciones,
                        'imagen': imagen
                    })
        
        # Actualizar total_piezas si se guardó
        if guardar.lower() == "true" and 'csv_guardado' in locals():
            csv_guardado.total_piezas = len(piezas_a_verificar)
        
        if not piezas_a_verificar:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se encontraron referencias válidas en el archivo"
            )
        
        # Obtener base de desguace del entorno
        base_desguace = db.query(BaseDesguace).filter(
            BaseDesguace.entorno_trabajo_id == current_user.entorno_trabajo_id
        ).first()
        
        # Optimización: crear un set de referencias para búsqueda rápida
        todas_refs = set(item['referencia'] for item in piezas_a_verificar)
        # También buscar por OE e IAM del CSV
        for item in piezas_a_verificar:
            if item.get('oe'):
                todas_refs.add(item['oe'])
            if item.get('iam'):
                todas_refs.add(item['iam'])
        
        # Una sola consulta para todas las piezas del inventario
        piezas_stock = {}
        if base_desguace:
            piezas_db = db.query(
                PiezaDesguace.refid,
                PiezaDesguace.oem, 
                PiezaDesguace.oe,
                PiezaDesguace.iam,
                PiezaDesguace.articulo,
                PiezaDesguace.marca,
                PiezaDesguace.precio,
                PiezaDesguace.ubicacion
            ).filter(
                PiezaDesguace.base_desguace_id == base_desguace.id
            ).all()
            
            # Indexar por referencia en memoria
            for pieza in piezas_db:
                for campo in [pieza.refid, pieza.oem, pieza.oe, pieza.iam]:
                    if campo and campo in todas_refs:
                        if campo not in piezas_stock:
                            piezas_stock[campo] = []
                        piezas_stock[campo].append(pieza)
        
        resultados = []
        encontradas = 0
        suficientes = 0
        a_comprar = 0
        
        for item in piezas_a_verificar:
            ref = item['referencia']
            cantidad_solicitada = item['cantidad']
            
            # Buscar por OEM, OE o IAM
            piezas_encontradas = piezas_stock.get(ref, [])
            if not piezas_encontradas and item.get('oe'):
                piezas_encontradas = piezas_stock.get(item['oe'], [])
            if not piezas_encontradas and item.get('iam'):
                piezas_encontradas = piezas_stock.get(item['iam'], [])
            
            cantidad_stock = len(piezas_encontradas)
            
            if cantidad_stock > 0:
                encontradas += 1
                primera = piezas_encontradas[0]
                
                porcentaje_stock = int((cantidad_stock / cantidad_solicitada) * 100) if cantidad_solicitada > 0 else 100
                tiene_suficiente = cantidad_stock >= cantidad_solicitada
                necesita_comprar = porcentaje_stock < umbral_compra
                cantidad_a_comprar = max(0, cantidad_solicitada - cantidad_stock)
                
                if tiene_suficiente:
                    suficientes += 1
                if necesita_comprar:
                    a_comprar += 1
                
                resultados.append({
                    'referencia': ref,
                    'cantidad_solicitada': cantidad_solicitada,
                    'encontrada': True,
                    'cantidad_stock': cantidad_stock,
                    'suficiente': tiene_suficiente,
                    'porcentaje_stock': min(porcentaje_stock, 999),
                    'necesita_comprar': necesita_comprar,
                    'cantidad_a_comprar': cantidad_a_comprar,
                    'articulo': primera.articulo,
                    'marca': primera.marca,
                    'precio': primera.precio or item.get('precio_csv'),
                    'ubicacion': primera.ubicacion,
                    'imagen': item.get('imagen'),
                    'oe': item.get('oe'),
                    'iam': item.get('iam'),
                    'observaciones': item.get('observaciones'),
                })
            else:
                # No encontrada en inventario = NECESITA COMPRAR toda la cantidad
                a_comprar += 1
                resultados.append({
                    'referencia': ref,
                    'cantidad_solicitada': cantidad_solicitada,
                    'encontrada': False,
                    'cantidad_stock': 0,
                    'suficiente': False,
                    'porcentaje_stock': 0,
                    'necesita_comprar': True,  # Las no encontradas también van a comprar
                    'cantidad_a_comprar': cantidad_solicitada,
                    'articulo': item.get('observaciones'),  # Usar observaciones como descripción
                    'marca': None,
                    'precio': item.get('precio_csv'),
                    'ubicacion': None,
                    'imagen': item.get('imagen'),
                    'oe': item.get('oe'),
                    'iam': item.get('iam'),
                    'observaciones': item.get('observaciones'),
                })
        
        db.commit()
        logger.info(f"Usuario {current_user.email} verificó {len(piezas_a_verificar)} piezas: {encontradas} encontradas, {a_comprar} para comprar")
        
        return {
            "success": True,
            "piezas": resultados,
            "resumen": {
                "total": len(piezas_a_verificar),
                "encontradas": encontradas,
                "suficientes": suficientes,
                "a_comprar": a_comprar,
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error verificando CSV: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al procesar el archivo: {str(e)}"
        )


class VerificarGuardadoRequest(BaseModel):
    umbral_compra: int = 30


@router.post("/verificar-guardado/{csv_id}")
async def verificar_csv_guardado(
    csv_id: int,
    request: VerificarGuardadoRequest,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Verificar disponibilidad de piezas usando un CSV guardado.
    """
    try:
        if not current_user.entorno_trabajo_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Usuario no tiene un entorno de trabajo asignado"
            )
        
        # Obtener el CSV guardado
        csv_guardado = db.query(CSVGuardado).filter(
            CSVGuardado.id == csv_id,
            CSVGuardado.entorno_trabajo_id == current_user.entorno_trabajo_id
        ).first()
        
        if not csv_guardado:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        
        if not os.path.exists(csv_guardado.ruta_archivo):
            raise HTTPException(status_code=404, detail="Archivo no existe en disco")
        
        # Leer contenido
        with open(csv_guardado.ruta_archivo, 'rb') as f:
            content = f.read()
        
        # Detectar encoding
        try:
            text = content.decode('utf-8')
        except:
            try:
                text = content.decode('latin-1')
            except:
                text = content.decode('cp1252', errors='ignore')
        
        # Parsear CSV
        lines = text.strip().split('\n')
        piezas_a_verificar = []
        umbral_compra = request.umbral_compra
        
        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue
            
            # Saltar cabecera
            lower_line = line.lower()
            if i == 0 and ('oem' in lower_line or 'referencia' in lower_line or 'cantidad' in lower_line):
                continue
            
            parts = line.split(';')
            
            if len(parts) >= 2:
                referencia = parts[0].strip()
                try:
                    cantidad = int(parts[1].strip())
                except ValueError:
                    cantidad = 1
                
                oe = parts[2].strip() if len(parts) > 2 else None
                iam = parts[3].strip() if len(parts) > 3 else None
                try:
                    precio_csv = float(parts[4].strip().replace(',', '.')) if len(parts) > 4 and parts[4].strip() else None
                except:
                    precio_csv = None
                observaciones = parts[5].strip() if len(parts) > 5 else None
                imagen = parts[6].strip() if len(parts) > 6 else None
                
                if referencia:
                    piezas_a_verificar.append({
                        'referencia': referencia,
                        'cantidad': cantidad,
                        'oe': oe,
                        'iam': iam,
                        'precio_csv': precio_csv,
                        'observaciones': observaciones,
                        'imagen': imagen
                    })
        
        if not piezas_a_verificar:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se encontraron referencias válidas en el archivo"
            )
        
        # Obtener base de desguace del entorno
        base_desguace = db.query(BaseDesguace).filter(
            BaseDesguace.entorno_trabajo_id == current_user.entorno_trabajo_id
        ).first()
        
        # Crear set de referencias para búsqueda
        todas_refs = set(item['referencia'] for item in piezas_a_verificar)
        for item in piezas_a_verificar:
            if item.get('oe'):
                todas_refs.add(item['oe'])
            if item.get('iam'):
                todas_refs.add(item['iam'])
        
        # Consulta optimizada
        piezas_stock = {}
        if base_desguace:
            piezas_db = db.query(
                PiezaDesguace.refid,
                PiezaDesguace.oem, 
                PiezaDesguace.oe,
                PiezaDesguace.iam,
                PiezaDesguace.articulo,
                PiezaDesguace.marca,
                PiezaDesguace.precio,
                PiezaDesguace.ubicacion
            ).filter(
                PiezaDesguace.base_desguace_id == base_desguace.id
            ).all()
            
            for pieza in piezas_db:
                for campo in [pieza.refid, pieza.oem, pieza.oe, pieza.iam]:
                    if campo and campo in todas_refs:
                        if campo not in piezas_stock:
                            piezas_stock[campo] = []
                        piezas_stock[campo].append(pieza)
        
        resultados = []
        encontradas = 0
        suficientes = 0
        a_comprar = 0
        
        for item in piezas_a_verificar:
            ref = item['referencia']
            cantidad_solicitada = item['cantidad']
            
            piezas_encontradas = piezas_stock.get(ref, [])
            if not piezas_encontradas and item.get('oe'):
                piezas_encontradas = piezas_stock.get(item['oe'], [])
            if not piezas_encontradas and item.get('iam'):
                piezas_encontradas = piezas_stock.get(item['iam'], [])
            
            cantidad_stock = len(piezas_encontradas)
            
            if cantidad_stock > 0:
                encontradas += 1
                primera = piezas_encontradas[0]
                
                porcentaje_stock = int((cantidad_stock / cantidad_solicitada) * 100) if cantidad_solicitada > 0 else 100
                tiene_suficiente = cantidad_stock >= cantidad_solicitada
                necesita_comprar = porcentaje_stock < umbral_compra
                cantidad_a_comprar = max(0, cantidad_solicitada - cantidad_stock)
                
                if tiene_suficiente:
                    suficientes += 1
                if necesita_comprar:
                    a_comprar += 1
                
                resultados.append({
                    'referencia': ref,
                    'cantidad_solicitada': cantidad_solicitada,
                    'encontrada': True,
                    'cantidad_stock': cantidad_stock,
                    'suficiente': tiene_suficiente,
                    'porcentaje_stock': min(porcentaje_stock, 999),
                    'necesita_comprar': necesita_comprar,
                    'cantidad_a_comprar': cantidad_a_comprar,
                    'articulo': primera.articulo,
                    'marca': primera.marca,
                    'precio': primera.precio or item.get('precio_csv'),
                    'ubicacion': primera.ubicacion,
                    'imagen': item.get('imagen'),
                    'oe': item.get('oe'),
                    'iam': item.get('iam'),
                    'observaciones': item.get('observaciones'),
                })
            else:
                a_comprar += 1
                resultados.append({
                    'referencia': ref,
                    'cantidad_solicitada': cantidad_solicitada,
                    'encontrada': False,
                    'cantidad_stock': 0,
                    'suficiente': False,
                    'porcentaje_stock': 0,
                    'necesita_comprar': True,
                    'cantidad_a_comprar': cantidad_solicitada,
                    'articulo': item.get('observaciones'),
                    'marca': None,
                    'precio': item.get('precio_csv'),
                    'ubicacion': None,
                    'imagen': item.get('imagen'),
                    'oe': item.get('oe'),
                    'iam': item.get('iam'),
                    'observaciones': item.get('observaciones'),
                })
        
        logger.info(f"Usuario {current_user.email} verificó CSV guardado {csv_id}: {encontradas} encontradas, {a_comprar} para comprar")
        
        return {
            "success": True,
            "piezas": resultados,
            "resumen": {
                "total": len(piezas_a_verificar),
                "encontradas": encontradas,
                "suficientes": suficientes,
                "a_comprar": a_comprar,
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verificando CSV guardado: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al verificar el archivo: {str(e)}"
        )


# ============== ENDPOINTS PARA CSV GUARDADOS ==============
@router.get("/csv-guardados")
async def listar_csv_guardados(
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Listar todos los CSVs guardados del entorno"""
    try:
        if not current_user.entorno_trabajo_id:
            return {"archivos": []}
        
        archivos = db.query(CSVGuardado).filter(
            CSVGuardado.entorno_trabajo_id == current_user.entorno_trabajo_id
        ).order_by(CSVGuardado.fecha_subida.desc()).all()
        
        return {
            "archivos": [
                {
                    "id": a.id,
                    "nombre": a.nombre,
                    "fecha": a.fecha_subida.isoformat() if a.fecha_subida else None,
                    "total_piezas": a.total_piezas
                }
                for a in archivos
            ]
        }
    except Exception as e:
        logger.error(f"Error listando CSVs: {e}")
        return {"archivos": []}


@router.get("/csv-guardados/{csv_id}")
async def descargar_csv(
    csv_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Descargar un CSV guardado"""
    try:
        csv_guardado = db.query(CSVGuardado).filter(
            CSVGuardado.id == csv_id,
            CSVGuardado.entorno_trabajo_id == current_user.entorno_trabajo_id
        ).first()
        
        if not csv_guardado:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        
        if not os.path.exists(csv_guardado.ruta_archivo):
            raise HTTPException(status_code=404, detail="Archivo no existe en disco")
        
        return FileResponse(
            csv_guardado.ruta_archivo,
            filename=csv_guardado.nombre,
            media_type="text/csv"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error descargando CSV: {e}")
        raise HTTPException(status_code=500, detail="Error al descargar")


@router.get("/csv-guardados/{csv_id}/contenido")
async def obtener_contenido_csv(
    csv_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Obtener el contenido del CSV para edición"""
    try:
        csv_guardado = db.query(CSVGuardado).filter(
            CSVGuardado.id == csv_id,
            CSVGuardado.entorno_trabajo_id == current_user.entorno_trabajo_id
        ).first()
        
        if not csv_guardado:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        
        if not os.path.exists(csv_guardado.ruta_archivo):
            raise HTTPException(status_code=404, detail="Archivo no existe en disco")
        
        # Leer contenido
        with open(csv_guardado.ruta_archivo, 'rb') as f:
            content = f.read()
        
        # Detectar encoding
        try:
            text = content.decode('utf-8')
        except:
            try:
                text = content.decode('latin-1')
            except:
                text = content.decode('cp1252', errors='ignore')
        
        # Parsear CSV
        lines = text.strip().split('\n')
        piezas = []
        
        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue
            
            # Saltar cabecera
            if i == 0 and 'oem' in line.lower():
                continue
            
            parts = line.split(';')
            if len(parts) >= 2:
                piezas.append({
                    'idx': i,
                    'oem': parts[0].strip() if len(parts) > 0 else '',
                    'cantidad': int(parts[1].strip()) if len(parts) > 1 and parts[1].strip().isdigit() else 1,
                    'oe': parts[2].strip() if len(parts) > 2 else '',
                    'iam': parts[3].strip() if len(parts) > 3 else '',
                    'precio': parts[4].strip() if len(parts) > 4 else '',
                    'observaciones': parts[5].strip() if len(parts) > 5 else '',
                    'imagen': parts[6].strip() if len(parts) > 6 else '',
                })
        
        return {
            "id": csv_guardado.id,
            "nombre": csv_guardado.nombre,
            "piezas": piezas,
            "total": len(piezas)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error leyendo CSV: {e}")
        raise HTTPException(status_code=500, detail="Error al leer el archivo")


class PiezaCSV(BaseModel):
    oem: str
    cantidad: int = 1
    oe: str = ""
    iam: str = ""
    precio: str = ""
    observaciones: str = ""
    imagen: str = ""


class ActualizarCSVRequest(BaseModel):
    piezas: List[PiezaCSV]


@router.put("/csv-guardados/{csv_id}")
async def actualizar_csv(
    csv_id: int,
    request: ActualizarCSVRequest,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Actualizar el contenido completo del CSV"""
    try:
        csv_guardado = db.query(CSVGuardado).filter(
            CSVGuardado.id == csv_id,
            CSVGuardado.entorno_trabajo_id == current_user.entorno_trabajo_id
        ).first()
        
        if not csv_guardado:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        
        # Generar nuevo contenido CSV
        lineas = ['oem;cantidad;oe;iam;precio;observaciones;imagen']
        for p in request.piezas:
            lineas.append(f"{p.oem};{p.cantidad};{p.oe};{p.iam};{p.precio};{p.observaciones};{p.imagen}")
        
        contenido = '\n'.join(lineas)
        
        # Guardar archivo
        with open(csv_guardado.ruta_archivo, 'w', encoding='utf-8') as f:
            f.write(contenido)
        
        # Actualizar contador
        csv_guardado.total_piezas = len(request.piezas)
        db.commit()
        
        logger.info(f"Usuario {current_user.email} actualizó CSV {csv_id} con {len(request.piezas)} piezas")
        
        return {
            "success": True,
            "message": f"CSV actualizado con {len(request.piezas)} piezas",
            "total": len(request.piezas)
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error actualizando CSV: {e}")
        raise HTTPException(status_code=500, detail="Error al actualizar el archivo")


@router.delete("/csv-guardados/{csv_id}")
async def eliminar_csv(
    csv_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Eliminar un CSV guardado"""
    try:
        csv_guardado = db.query(CSVGuardado).filter(
            CSVGuardado.id == csv_id,
            CSVGuardado.entorno_trabajo_id == current_user.entorno_trabajo_id
        ).first()
        
        if not csv_guardado:
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        
        # Eliminar archivo físico
        if os.path.exists(csv_guardado.ruta_archivo):
            os.remove(csv_guardado.ruta_archivo)
        
        # Eliminar registro de BD
        db.delete(csv_guardado)
        db.commit()
        
        return {"success": True, "message": "Archivo eliminado"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error eliminando CSV: {e}")
        raise HTTPException(status_code=500, detail="Error al eliminar")


# ============== ENDPOINTS PARA PIEZAS PEDIDAS ==============
class MarcarPedidaRequest(BaseModel):
    referencia: str
    cantidad: int = 1
    observaciones: Optional[str] = None


@router.post("/pedidas")
async def marcar_pieza_pedida(
    request: MarcarPedidaRequest,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Marcar una pieza como pedida/comprada"""
    try:
        if not current_user.entorno_trabajo_id:
            raise HTTPException(status_code=400, detail="Usuario sin entorno de trabajo")
        
        # Verificar si ya existe esta referencia como pedida (no recibida)
        existente = db.query(PiezaPedida).filter(
            PiezaPedida.entorno_trabajo_id == current_user.entorno_trabajo_id,
            PiezaPedida.referencia == request.referencia,
            PiezaPedida.recibida == False
        ).first()
        
        if existente:
            # Actualizar cantidad
            existente.cantidad += request.cantidad
            existente.fecha_pedido = now_spain_naive()
            db.commit()
            return {"success": True, "message": f"Cantidad actualizada: {existente.cantidad}"}
        
        # Crear nuevo registro
        nueva = PiezaPedida(
            entorno_trabajo_id=current_user.entorno_trabajo_id,
            usuario_id=current_user.id,
            referencia=request.referencia,
            cantidad=request.cantidad,
            observaciones=request.observaciones,
            fecha_pedido=now_spain_naive()
        )
        db.add(nueva)
        db.commit()
        
        logger.info(f"Usuario {current_user.email} marcó como pedida: {request.referencia}")
        return {"success": True, "message": "Pieza marcada como pedida"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error marcando pieza como pedida: {e}")
        raise HTTPException(status_code=500, detail="Error al marcar como pedida")


@router.get("/pedidas")
async def listar_piezas_pedidas(
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Listar piezas pedidas (no recibidas)"""
    try:
        if not current_user.entorno_trabajo_id:
            return {"piezas": []}
        
        pedidas = db.query(PiezaPedida).filter(
            PiezaPedida.entorno_trabajo_id == current_user.entorno_trabajo_id,
            PiezaPedida.recibida == False
        ).order_by(PiezaPedida.fecha_pedido.desc()).all()
        
        return {
            "piezas": [
                {
                    "id": p.id,
                    "referencia": p.referencia,
                    "cantidad": p.cantidad,
                    "observaciones": p.observaciones,
                    "fecha_pedido": p.fecha_pedido.isoformat() if p.fecha_pedido else None
                }
                for p in pedidas
            ]
        }
    except Exception as e:
        logger.error(f"Error listando pedidas: {e}")
        return {"piezas": []}


@router.delete("/pedidas/{referencia}")
async def desmarcar_pieza_pedida(
    referencia: str,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Desmarcar una pieza como pedida (cancelar pedido)"""
    try:
        pedida = db.query(PiezaPedida).filter(
            PiezaPedida.entorno_trabajo_id == current_user.entorno_trabajo_id,
            PiezaPedida.referencia == referencia,
            PiezaPedida.recibida == False
        ).first()
        
        if not pedida:
            raise HTTPException(status_code=404, detail="Pieza no encontrada")
        
        db.delete(pedida)
        db.commit()
        
        return {"success": True, "message": "Pedido cancelado"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error desmarcando pedida: {e}")
        raise HTTPException(status_code=500, detail="Error al cancelar pedido")
