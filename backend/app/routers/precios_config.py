"""
Router para gestionar la configuración de precios por desguace/entorno
Permite subir archivos pieza_familia.csv y familia_precios.csv por empresa
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import Optional, List
import csv
import io
import logging

from app.database import get_db
from app.models.busqueda import (
    Usuario, EntornoTrabajo, 
    ConfiguracionPrecios, PiezaFamiliaDesguace, FamiliaPreciosDesguace
)
from app.routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/estado")
async def obtener_estado_configuracion(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Obtiene el estado actual de la configuración de precios del entorno"""
    if not current_user.entorno_trabajo_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario no tiene entorno de trabajo asignado"
        )
    
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == current_user.entorno_trabajo_id
    ).first()
    
    if not config:
        return {
            "tiene_configuracion": False,
            "pieza_familia": None,
            "familia_precios": None
        }
    
    return {
        "tiene_configuracion": True,
        "pieza_familia": {
            "archivo": config.pieza_familia_archivo,
            "registros": config.pieza_familia_registros,
            "tiene_datos": config.pieza_familia_registros > 0
        },
        "familia_precios": {
            "archivo": config.familia_precios_archivo,
            "registros": config.familia_precios_registros,
            "tiene_datos": config.familia_precios_registros > 0
        },
        "fecha_actualizacion": config.fecha_actualizacion or config.fecha_subida
    }


@router.post("/pieza-familia")
async def subir_pieza_familia(
    file: UploadFile = File(...),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Sube el archivo pieza_familia.csv para el entorno del usuario
    Formato esperado: PIEZA;FAMILIA
    """
    # Verificar rol (solo owner o admin pueden subir)
    if current_user.rol not in ["sysowner", "owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo administradores pueden subir archivos de configuración"
        )
    
    if not current_user.entorno_trabajo_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario no tiene entorno de trabajo asignado"
        )
    
    # Leer contenido del archivo
    try:
        content = await file.read()
        # Intentar diferentes encodings
        for encoding in ['utf-8', 'latin-1', 'cp1252']:
            try:
                decoded = content.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se pudo decodificar el archivo"
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error leyendo archivo: {str(e)}"
        )
    
    # Parsear CSV
    try:
        reader = csv.DictReader(io.StringIO(decoded), delimiter=';')
        registros = []
        
        for row in reader:
            pieza = row.get('PIEZA', '').strip().upper()
            familia = row.get('FAMILIA', '').strip().upper()
            
            if pieza and familia:
                registros.append({"pieza": pieza, "familia": familia})
        
        if not registros:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se encontraron registros válidos. Formato esperado: PIEZA;FAMILIA"
            )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error parseando CSV: {str(e)}"
        )
    
    # Obtener o crear configuración
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == current_user.entorno_trabajo_id
    ).first()
    
    if not config:
        config = ConfiguracionPrecios(
            entorno_trabajo_id=current_user.entorno_trabajo_id,
            subido_por_id=current_user.id
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    
    # Eliminar registros anteriores de pieza_familia
    db.query(PiezaFamiliaDesguace).filter(
        PiezaFamiliaDesguace.configuracion_id == config.id
    ).delete()
    
    # Insertar nuevos registros
    for reg in registros:
        db.add(PiezaFamiliaDesguace(
            configuracion_id=config.id,
            pieza=reg["pieza"],
            familia=reg["familia"]
        ))
    
    # Actualizar info de configuración
    config.pieza_familia_archivo = file.filename
    config.pieza_familia_registros = len(registros)
    config.subido_por_id = current_user.id
    
    db.commit()
    
    logger.info(f"Subido pieza_familia para entorno {current_user.entorno_trabajo_id}: {len(registros)} registros")
    
    return {
        "success": True,
        "mensaje": f"Archivo subido correctamente",
        "archivo": file.filename,
        "registros": len(registros)
    }


@router.post("/familia-precios")
async def subir_familia_precios(
    file: UploadFile = File(...),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Sube el archivo familia_precios.csv para el entorno del usuario
    Formato esperado: FAMILIA;PRECIO1;PRECIO2;...;PRECIO20
    """
    # Verificar rol
    if current_user.rol not in ["sysowner", "owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo administradores pueden subir archivos de configuración"
        )
    
    if not current_user.entorno_trabajo_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario no tiene entorno de trabajo asignado"
        )
    
    # Leer contenido del archivo
    try:
        content = await file.read()
        for encoding in ['utf-8', 'latin-1', 'cp1252']:
            try:
                decoded = content.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se pudo decodificar el archivo"
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error leyendo archivo: {str(e)}"
        )
    
    # Parsear CSV
    try:
        reader = csv.DictReader(io.StringIO(decoded), delimiter=';')
        registros = []
        
        for row in reader:
            familia = row.get('FAMILIA', '').strip().upper()
            if not familia:
                continue
            
            # Extraer precios (PRECIO1 a PRECIO20)
            precios = []
            for i in range(1, 21):
                precio_str = row.get(f'PRECIO{i}', '')
                if precio_str and precio_str.strip():
                    try:
                        precio = float(precio_str.strip().replace(',', '.'))
                        precios.append(precio)
                    except ValueError:
                        pass
            
            if precios:
                # Ordenar y guardar como string
                precios_str = ",".join([str(p) for p in sorted(precios)])
                registros.append({"familia": familia, "precios": precios_str})
        
        if not registros:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se encontraron registros válidos. Formato: FAMILIA;PRECIO1;PRECIO2;..."
            )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error parseando CSV: {str(e)}"
        )
    
    # Obtener o crear configuración
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == current_user.entorno_trabajo_id
    ).first()
    
    if not config:
        config = ConfiguracionPrecios(
            entorno_trabajo_id=current_user.entorno_trabajo_id,
            subido_por_id=current_user.id
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    
    # Eliminar registros anteriores
    db.query(FamiliaPreciosDesguace).filter(
        FamiliaPreciosDesguace.configuracion_id == config.id
    ).delete()
    
    # Insertar nuevos registros
    for reg in registros:
        db.add(FamiliaPreciosDesguace(
            configuracion_id=config.id,
            familia=reg["familia"],
            precios=reg["precios"]
        ))
    
    # Actualizar info de configuración
    config.familia_precios_archivo = file.filename
    config.familia_precios_registros = len(registros)
    config.subido_por_id = current_user.id
    
    db.commit()
    
    logger.info(f"Subido familia_precios para entorno {current_user.entorno_trabajo_id}: {len(registros)} registros")
    
    return {
        "success": True,
        "mensaje": f"Archivo subido correctamente",
        "archivo": file.filename,
        "registros": len(registros)
    }


@router.get("/piezas-familia")
async def listar_piezas_familia(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lista las piezas y sus familias configuradas"""
    if not current_user.entorno_trabajo_id:
        return []
    
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == current_user.entorno_trabajo_id
    ).first()
    
    if not config:
        return []
    
    piezas = db.query(PiezaFamiliaDesguace).filter(
        PiezaFamiliaDesguace.configuracion_id == config.id
    ).all()
    
    return [{"pieza": p.pieza, "familia": p.familia} for p in piezas]


@router.get("/familias-precios")
async def listar_familias_precios(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lista las familias y sus precios configurados"""
    if not current_user.entorno_trabajo_id:
        return []
    
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == current_user.entorno_trabajo_id
    ).first()
    
    if not config:
        return []
    
    familias = db.query(FamiliaPreciosDesguace).filter(
        FamiliaPreciosDesguace.configuracion_id == config.id
    ).all()
    
    return [
        {
            "familia": f.familia, 
            "precios": [float(p) for p in f.precios.split(",") if p]
        } 
        for f in familias
    ]


@router.delete("/eliminar")
async def eliminar_configuracion(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Elimina toda la configuración de precios del entorno"""
    if current_user.rol not in ["sysowner", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo propietarios pueden eliminar la configuración"
        )
    
    if not current_user.entorno_trabajo_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario no tiene entorno de trabajo asignado"
        )
    
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == current_user.entorno_trabajo_id
    ).first()
    
    if config:
        db.delete(config)
        db.commit()
    
    return {"success": True, "mensaje": "Configuración eliminada"}
