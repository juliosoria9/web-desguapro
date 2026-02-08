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


@router.get("/entornos")
async def listar_entornos(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lista todos los entornos de trabajo (solo para sysowner)"""
    if current_user.rol != "sysowner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo sysowner puede listar entornos"
        )
    
    entornos = db.query(EntornoTrabajo).all()
    return [{"id": e.id, "nombre": e.nombre} for e in entornos]


@router.get("/estado")
async def obtener_estado_configuracion(
    entorno_id: Optional[int] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Obtiene el estado actual de la configuración de precios del entorno"""
    # Sysowner puede ver cualquier entorno
    if current_user.rol == "sysowner" and entorno_id:
        target_entorno_id = entorno_id
    else:
        target_entorno_id = current_user.entorno_trabajo_id
    
    if not target_entorno_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario no tiene entorno de trabajo asignado"
        )
    
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == target_entorno_id
    ).first()
    
    if not config:
        return {
            "tiene_configuracion": False,
            "pieza_familia": None,
            "familia_precios": None,
            "entorno_id": target_entorno_id
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
        "fecha_actualizacion": config.fecha_actualizacion or config.fecha_subida,
        "entorno_id": target_entorno_id
    }


@router.post("/pieza-familia")
async def subir_pieza_familia(
    file: UploadFile = File(...),
    entorno_id: Optional[int] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Sube el archivo pieza_familia.csv para el entorno del usuario
    Formato esperado: PIEZA;FAMILIA
    Solo admin, owner o sysowner pueden subir archivos.
    Sysowner puede especificar entorno_id para subir a otra empresa.
    """
    # Verificar permisos - solo admin+ puede subir
    if current_user.rol not in ["sysowner", "owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo administradores pueden subir archivos de configuración"
        )
    # Determinar entorno destino
    if current_user.rol == "sysowner" and entorno_id:
        target_entorno_id = entorno_id
    else:
        target_entorno_id = current_user.entorno_trabajo_id
    
    if not target_entorno_id:
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
        ConfiguracionPrecios.entorno_trabajo_id == target_entorno_id
    ).first()
    
    if not config:
        config = ConfiguracionPrecios(
            entorno_trabajo_id=target_entorno_id,
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
    
    logger.info(f"Subido pieza_familia para entorno {target_entorno_id}: {len(registros)} registros")
    
    return {
        "success": True,
        "mensaje": f"Archivo subido correctamente",
        "archivo": file.filename,
        "registros": len(registros)
    }


@router.post("/familia-precios")
async def subir_familia_precios(
    file: UploadFile = File(...),
    entorno_id: Optional[int] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Sube el archivo familia_precios.csv para el entorno del usuario
    Formato esperado: FAMILIA;PRECIO1;PRECIO2;...;PRECIO20
    Solo admin, owner o sysowner pueden subir archivos.
    Sysowner puede especificar entorno_id para subir a otra empresa.
    """
    # Verificar permisos - solo admin+ puede subir
    if current_user.rol not in ["sysowner", "owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo administradores pueden subir archivos de configuración"
        )
    
    # Determinar entorno destino
    if current_user.rol == "sysowner" and entorno_id:
        target_entorno_id = entorno_id
    else:
        target_entorno_id = current_user.entorno_trabajo_id
    
    if not target_entorno_id:
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
        ConfiguracionPrecios.entorno_trabajo_id == target_entorno_id
    ).first()
    
    if not config:
        config = ConfiguracionPrecios(
            entorno_trabajo_id=target_entorno_id,
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
    
    logger.info(f"Subido familia_precios para entorno {target_entorno_id}: {len(registros)} registros")
    
    return {
        "success": True,
        "mensaje": f"Archivo subido correctamente",
        "archivo": file.filename,
        "registros": len(registros)
    }


@router.get("/piezas-familia")
async def listar_piezas_familia(
    entorno_id: Optional[int] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lista las piezas y sus familias configuradas"""
    # Sysowner puede ver cualquier entorno
    if current_user.rol == "sysowner" and entorno_id:
        target_entorno_id = entorno_id
    else:
        target_entorno_id = current_user.entorno_trabajo_id
    
    if not target_entorno_id:
        return []
    
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == target_entorno_id
    ).first()
    
    if not config:
        return []
    
    piezas = db.query(PiezaFamiliaDesguace).filter(
        PiezaFamiliaDesguace.configuracion_id == config.id
    ).all()
    
    return [{"id": p.id, "pieza": p.pieza, "familia": p.familia} for p in piezas]


@router.get("/familias-precios")
async def listar_familias_precios(
    entorno_id: Optional[int] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lista las familias y sus precios configurados"""
    # Sysowner puede ver cualquier entorno
    if current_user.rol == "sysowner" and entorno_id:
        target_entorno_id = entorno_id
    else:
        target_entorno_id = current_user.entorno_trabajo_id
    
    if not target_entorno_id:
        return []
    
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == target_entorno_id
    ).first()
    
    if not config:
        return []
    
    familias = db.query(FamiliaPreciosDesguace).filter(
        FamiliaPreciosDesguace.configuracion_id == config.id
    ).all()
    
    return [
        {
            "id": f.id,
            "familia": f.familia, 
            "precios": [float(p) for p in f.precios.split(",") if p]
        } 
        for f in familias
    ]


@router.delete("/eliminar")
async def eliminar_configuracion(
    entorno_id: Optional[int] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Elimina toda la configuración de precios del entorno"""
    if current_user.rol not in ["sysowner", "owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo propietarios pueden eliminar la configuración"
        )
    
    # Sysowner puede eliminar cualquier entorno
    if current_user.rol == "sysowner" and entorno_id:
        target_entorno_id = entorno_id
    else:
        target_entorno_id = current_user.entorno_trabajo_id
    
    if not target_entorno_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario no tiene entorno de trabajo asignado"
        )
    
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == target_entorno_id
    ).first()
    
    if config:
        db.delete(config)
        db.commit()
    
    return {"success": True, "mensaje": "Configuración eliminada"}


# =====================================================
# CRUD PIEZA-FAMILIA (Edición individual)
# =====================================================

@router.post("/pieza-familia/nuevo")
async def crear_pieza_familia(
    pieza: str,
    familia: str,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Crea un nuevo registro pieza-familia"""
    if current_user.rol not in ["sysowner", "owner", "admin"]:
        raise HTTPException(status_code=403, detail="Sin permisos")
    
    if not current_user.entorno_trabajo_id:
        raise HTTPException(status_code=400, detail="Sin entorno de trabajo")
    
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
    
    # Verificar si ya existe
    existente = db.query(PiezaFamiliaDesguace).filter(
        PiezaFamiliaDesguace.configuracion_id == config.id,
        PiezaFamiliaDesguace.pieza == pieza.strip().upper()
    ).first()
    
    if existente:
        raise HTTPException(status_code=400, detail=f"La pieza '{pieza}' ya existe")
    
    nuevo = PiezaFamiliaDesguace(
        configuracion_id=config.id,
        pieza=pieza.strip().upper(),
        familia=familia.strip().upper()
    )
    db.add(nuevo)
    
    # Actualizar contador
    config.pieza_familia_registros = db.query(PiezaFamiliaDesguace).filter(
        PiezaFamiliaDesguace.configuracion_id == config.id
    ).count() + 1
    
    db.commit()
    
    return {"success": True, "mensaje": "Registro creado", "id": nuevo.id}


@router.put("/pieza-familia/{id}")
async def actualizar_pieza_familia(
    id: int,
    pieza: str,
    familia: str,
    entorno_id: Optional[int] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Actualiza un registro pieza-familia"""
    if current_user.rol not in ["sysowner", "owner", "admin"]:
        raise HTTPException(status_code=403, detail="Sin permisos")
    
    # Sysowner puede editar cualquier entorno
    target_entorno_id = entorno_id if current_user.rol == "sysowner" and entorno_id else current_user.entorno_trabajo_id
    
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == target_entorno_id
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="No hay configuración")
    
    registro = db.query(PiezaFamiliaDesguace).filter(
        PiezaFamiliaDesguace.id == id,
        PiezaFamiliaDesguace.configuracion_id == config.id
    ).first()
    
    if not registro:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    
    registro.pieza = pieza.strip().upper()
    registro.familia = familia.strip().upper()
    db.commit()
    
    return {"success": True, "mensaje": "Registro actualizado"}


@router.delete("/pieza-familia/{id}")
async def eliminar_pieza_familia(
    id: int,
    entorno_id: Optional[int] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Elimina un registro pieza-familia"""
    if current_user.rol not in ["sysowner", "owner", "admin"]:
        raise HTTPException(status_code=403, detail="Sin permisos")
    
    # Sysowner puede eliminar en cualquier entorno
    target_entorno_id = entorno_id if current_user.rol == "sysowner" and entorno_id else current_user.entorno_trabajo_id
    
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == target_entorno_id
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="No hay configuración")
    
    registro = db.query(PiezaFamiliaDesguace).filter(
        PiezaFamiliaDesguace.id == id,
        PiezaFamiliaDesguace.configuracion_id == config.id
    ).first()
    
    if not registro:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    
    db.delete(registro)
    
    # Actualizar contador
    config.pieza_familia_registros = db.query(PiezaFamiliaDesguace).filter(
        PiezaFamiliaDesguace.configuracion_id == config.id
    ).count() - 1
    
    db.commit()
    
    return {"success": True, "mensaje": "Registro eliminado"}


# =====================================================
# CRUD FAMILIA-PRECIOS (Edición individual)
# =====================================================

@router.post("/familia-precios/nuevo")
async def crear_familia_precios(
    familia: str,
    precios: str,  # Separados por coma: "10,20,30,40"
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Crea un nuevo registro familia-precios"""
    if current_user.rol not in ["sysowner", "owner", "admin"]:
        raise HTTPException(status_code=403, detail="Sin permisos")
    
    if not current_user.entorno_trabajo_id:
        raise HTTPException(status_code=400, detail="Sin entorno de trabajo")
    
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
    
    # Verificar si ya existe
    existente = db.query(FamiliaPreciosDesguace).filter(
        FamiliaPreciosDesguace.configuracion_id == config.id,
        FamiliaPreciosDesguace.familia == familia.strip().upper()
    ).first()
    
    if existente:
        raise HTTPException(status_code=400, detail=f"La familia '{familia}' ya existe")
    
    # Validar y ordenar precios
    try:
        lista_precios = [float(p.strip().replace(',', '.')) for p in precios.split(',') if p.strip()]
        lista_precios.sort()
        precios_str = ",".join([str(p) for p in lista_precios])
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de precios inválido")
    
    nuevo = FamiliaPreciosDesguace(
        configuracion_id=config.id,
        familia=familia.strip().upper(),
        precios=precios_str
    )
    db.add(nuevo)
    
    # Actualizar contador
    config.familia_precios_registros = db.query(FamiliaPreciosDesguace).filter(
        FamiliaPreciosDesguace.configuracion_id == config.id
    ).count() + 1
    
    db.commit()
    
    return {"success": True, "mensaje": "Registro creado", "id": nuevo.id}


@router.put("/familia-precios/{id}")
async def actualizar_familia_precios(
    id: int,
    familia: str,
    precios: str,
    entorno_id: Optional[int] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Actualiza un registro familia-precios"""
    if current_user.rol not in ["sysowner", "owner", "admin"]:
        raise HTTPException(status_code=403, detail="Sin permisos")
    
    # Sysowner puede editar cualquier entorno
    target_entorno_id = entorno_id if current_user.rol == "sysowner" and entorno_id else current_user.entorno_trabajo_id
    
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == target_entorno_id
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="No hay configuración")
    
    registro = db.query(FamiliaPreciosDesguace).filter(
        FamiliaPreciosDesguace.id == id,
        FamiliaPreciosDesguace.configuracion_id == config.id
    ).first()
    
    if not registro:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    
    # Validar y ordenar precios
    try:
        lista_precios = [float(p.strip().replace(',', '.')) for p in precios.split(',') if p.strip()]
        lista_precios.sort()
        precios_str = ",".join([str(p) for p in lista_precios])
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de precios inválido")
    
    registro.familia = familia.strip().upper()
    registro.precios = precios_str
    db.commit()
    
    return {"success": True, "mensaje": "Registro actualizado"}


@router.delete("/familia-precios/{id}")
async def eliminar_familia_precios(
    id: int,
    entorno_id: Optional[int] = None,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Elimina un registro familia-precios"""
    if current_user.rol not in ["sysowner", "owner", "admin"]:
        raise HTTPException(status_code=403, detail="Sin permisos")
    
    # Sysowner puede eliminar en cualquier entorno
    target_entorno_id = entorno_id if current_user.rol == "sysowner" and entorno_id else current_user.entorno_trabajo_id
    
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == target_entorno_id
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="No hay configuración")
    
    registro = db.query(FamiliaPreciosDesguace).filter(
        FamiliaPreciosDesguace.id == id,
        FamiliaPreciosDesguace.configuracion_id == config.id
    ).first()
    
    if not registro:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    
    db.delete(registro)
    
    # Actualizar contador
    config.familia_precios_registros = db.query(FamiliaPreciosDesguace).filter(
        FamiliaPreciosDesguace.configuracion_id == config.id
    ).count() - 1
    
    db.commit()
    
    return {"success": True, "mensaje": "Registro eliminado"}


# =====================================================
# EXPORTAR A CSV
# =====================================================

@router.get("/exportar/pieza-familia")
async def exportar_pieza_familia(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Exporta los datos pieza-familia a CSV"""
    from fastapi.responses import StreamingResponse
    
    if not current_user.entorno_trabajo_id:
        raise HTTPException(status_code=400, detail="Sin entorno de trabajo")
    
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == current_user.entorno_trabajo_id
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="No hay configuración")
    
    piezas = db.query(PiezaFamiliaDesguace).filter(
        PiezaFamiliaDesguace.configuracion_id == config.id
    ).all()
    
    # Crear CSV en memoria
    output = io.StringIO()
    output.write("PIEZA;FAMILIA\n")
    for p in piezas:
        output.write(f"{p.pieza};{p.familia}\n")
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=pieza_familia.csv"}
    )


@router.get("/exportar/familia-precios")
async def exportar_familia_precios(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Exporta los datos familia-precios a CSV"""
    from fastapi.responses import StreamingResponse
    
    if not current_user.entorno_trabajo_id:
        raise HTTPException(status_code=400, detail="Sin entorno de trabajo")
    
    config = db.query(ConfiguracionPrecios).filter(
        ConfiguracionPrecios.entorno_trabajo_id == current_user.entorno_trabajo_id
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="No hay configuración")
    
    familias = db.query(FamiliaPreciosDesguace).filter(
        FamiliaPreciosDesguace.configuracion_id == config.id
    ).all()
    
    # Crear CSV en memoria - Máximo 20 columnas de precio
    output = io.StringIO()
    headers = ["FAMILIA"] + [f"PRECIO{i}" for i in range(1, 21)]
    output.write(";".join(headers) + "\n")
    
    for f in familias:
        precios_list = f.precios.split(",") if f.precios else []
        # Rellenar hasta 20 precios
        precios_list = precios_list + [""] * (20 - len(precios_list))
        output.write(f"{f.familia};" + ";".join(precios_list[:20]) + "\n")
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=familia_precios.csv"}
    )
