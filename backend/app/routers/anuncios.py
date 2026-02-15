"""
Router para gestión de anuncios y changelog
Solo sysowner puede crear/editar anuncios
Todos los usuarios pueden leerlos y marcarlos como leídos
"""
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime
from pydantic import BaseModel, Field
import logging

from app.database import get_db
from app.models.busqueda import Usuario, Anuncio, AnuncioLeido
from app.dependencies import get_current_user, get_current_sysowner
from utils.timezone import now_spain_naive

logger = logging.getLogger(__name__)
router = APIRouter()


# ============== SCHEMAS ==============
class AnuncioCreate(BaseModel):
    """Schema para crear anuncio"""
    titulo: str = Field(..., min_length=1, max_length=255)
    contenido: str = Field(..., min_length=1, max_length=5000)
    version: Optional[str] = Field(None, max_length=50)
    tipo: str = Field(default="changelog", pattern="^(changelog|anuncio|mantenimiento)$")
    mostrar_popup: bool = True


class AnuncioUpdate(BaseModel):
    """Schema para actualizar anuncio"""
    titulo: Optional[str] = Field(None, max_length=255)
    contenido: Optional[str] = Field(None, max_length=5000)
    version: Optional[str] = Field(None, max_length=50)
    tipo: Optional[str] = Field(None, pattern="^(changelog|anuncio|mantenimiento)$")
    activo: Optional[bool] = None
    mostrar_popup: Optional[bool] = None


class AnuncioResponse(BaseModel):
    """Schema de respuesta de anuncio"""
    id: int
    titulo: str
    contenido: str
    version: Optional[str]
    tipo: str
    activo: bool
    mostrar_popup: bool
    creado_por_email: Optional[str]
    fecha_creacion: datetime
    leido: bool = False  # Si el usuario actual lo ha leído
    
    class Config:
        from_attributes = True


# ============== ENDPOINTS PARA SYSOWNER ==============
@router.post("/crear", response_model=AnuncioResponse)
async def crear_anuncio(
    anuncio: AnuncioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_sysowner)
):
    """Crear un nuevo anuncio (solo SYSOWNER)"""
    try:
        nuevo_anuncio = Anuncio(
            titulo=anuncio.titulo,
            contenido=anuncio.contenido,
            version=anuncio.version,
            tipo=anuncio.tipo,
            mostrar_popup=anuncio.mostrar_popup,
            creado_por_id=current_user.id,
            activo=True
        )
        db.add(nuevo_anuncio)
        db.commit()
        db.refresh(nuevo_anuncio)
        
        logger.info(f"Anuncio creado: '{nuevo_anuncio.titulo}' por {current_user.email}")
        
        return AnuncioResponse(
            id=nuevo_anuncio.id,
            titulo=nuevo_anuncio.titulo,
            contenido=nuevo_anuncio.contenido,
            version=nuevo_anuncio.version,
            tipo=nuevo_anuncio.tipo,
            activo=nuevo_anuncio.activo,
            mostrar_popup=nuevo_anuncio.mostrar_popup,
            creado_por_email=current_user.email,
            fecha_creacion=nuevo_anuncio.fecha_creacion,
            leido=True  # El creador lo marca como leído automáticamente
        )
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creando anuncio: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al crear anuncio"
        )


@router.put("/{anuncio_id}", response_model=AnuncioResponse)
async def actualizar_anuncio(
    anuncio_id: int,
    datos: AnuncioUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_sysowner)
):
    """Actualizar un anuncio existente (solo SYSOWNER)"""
    anuncio = db.query(Anuncio).filter(Anuncio.id == anuncio_id).first()
    if not anuncio:
        raise HTTPException(status_code=404, detail="Anuncio no encontrado")
    
    try:
        if datos.titulo is not None:
            anuncio.titulo = datos.titulo
        if datos.contenido is not None:
            anuncio.contenido = datos.contenido
        if datos.version is not None:
            anuncio.version = datos.version
        if datos.tipo is not None:
            anuncio.tipo = datos.tipo
        if datos.activo is not None:
            anuncio.activo = datos.activo
        if datos.mostrar_popup is not None:
            anuncio.mostrar_popup = datos.mostrar_popup
        
        db.commit()
        db.refresh(anuncio)
        
        creador = db.query(Usuario).filter(Usuario.id == anuncio.creado_por_id).first()
        
        return AnuncioResponse(
            id=anuncio.id,
            titulo=anuncio.titulo,
            contenido=anuncio.contenido,
            version=anuncio.version,
            tipo=anuncio.tipo,
            activo=anuncio.activo,
            mostrar_popup=anuncio.mostrar_popup,
            creado_por_email=creador.email if creador else None,
            fecha_creacion=anuncio.fecha_creacion,
            leido=True
        )
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error actualizando anuncio: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al actualizar anuncio"
        )


@router.delete("/{anuncio_id}")
async def eliminar_anuncio(
    anuncio_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_sysowner)
):
    """Eliminar un anuncio (solo SYSOWNER)"""
    anuncio = db.query(Anuncio).filter(Anuncio.id == anuncio_id).first()
    if not anuncio:
        raise HTTPException(status_code=404, detail="Anuncio no encontrado")
    
    try:
        titulo = anuncio.titulo
        db.delete(anuncio)
        db.commit()
        logger.info(f"Anuncio eliminado: '{titulo}' por {current_user.email}")
        return {"message": f"Anuncio '{titulo}' eliminado"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error eliminando anuncio: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al eliminar anuncio"
        )


@router.get("/admin/todos", response_model=List[AnuncioResponse])
async def listar_todos_anuncios(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_sysowner)
):
    """Listar todos los anuncios para administración (solo SYSOWNER)"""
    anuncios = db.query(Anuncio).order_by(desc(Anuncio.fecha_creacion)).all()
    
    resultado = []
    for anuncio in anuncios:
        creador = db.query(Usuario).filter(Usuario.id == anuncio.creado_por_id).first()
        resultado.append(AnuncioResponse(
            id=anuncio.id,
            titulo=anuncio.titulo,
            contenido=anuncio.contenido,
            version=anuncio.version,
            tipo=anuncio.tipo,
            activo=anuncio.activo,
            mostrar_popup=anuncio.mostrar_popup,
            creado_por_email=creador.email if creador else None,
            fecha_creacion=anuncio.fecha_creacion,
            leido=True
        ))
    
    return resultado


# ============== ENDPOINTS PARA USUARIOS ==============
@router.get("/no-leidos", response_model=List[AnuncioResponse])
async def obtener_anuncios_no_leidos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener anuncios activos no leídos por el usuario (para popup)"""
    # Obtener IDs de anuncios ya leídos
    leidos_ids = db.query(AnuncioLeido.anuncio_id).filter(
        AnuncioLeido.usuario_id == current_user.id
    ).all()
    leidos_ids = [l[0] for l in leidos_ids]
    
    # Obtener anuncios activos con popup que no hayan sido leídos
    query = db.query(Anuncio).filter(
        Anuncio.activo == True,
        Anuncio.mostrar_popup == True,
    )
    if leidos_ids:
        query = query.filter(~Anuncio.id.in_(leidos_ids))
    anuncios = query.order_by(desc(Anuncio.fecha_creacion)).all()
    
    resultado = []
    for anuncio in anuncios:
        creador = db.query(Usuario).filter(Usuario.id == anuncio.creado_por_id).first()
        resultado.append(AnuncioResponse(
            id=anuncio.id,
            titulo=anuncio.titulo,
            contenido=anuncio.contenido,
            version=anuncio.version,
            tipo=anuncio.tipo,
            activo=anuncio.activo,
            mostrar_popup=anuncio.mostrar_popup,
            creado_por_email=creador.email if creador else None,
            fecha_creacion=anuncio.fecha_creacion,
            leido=False
        ))
    
    return resultado


@router.get("/changelog", response_model=List[AnuncioResponse])
async def obtener_changelog(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener todos los anuncios activos (para historial/changelog)"""
    # Obtener IDs de anuncios ya leídos
    leidos_ids = db.query(AnuncioLeido.anuncio_id).filter(
        AnuncioLeido.usuario_id == current_user.id
    ).all()
    leidos_ids = [l[0] for l in leidos_ids]
    
    # Obtener todos los anuncios activos
    anuncios = db.query(Anuncio).filter(
        Anuncio.activo == True
    ).order_by(desc(Anuncio.fecha_creacion)).all()
    
    resultado = []
    for anuncio in anuncios:
        creador = db.query(Usuario).filter(Usuario.id == anuncio.creado_por_id).first()
        resultado.append(AnuncioResponse(
            id=anuncio.id,
            titulo=anuncio.titulo,
            contenido=anuncio.contenido,
            version=anuncio.version,
            tipo=anuncio.tipo,
            activo=anuncio.activo,
            mostrar_popup=anuncio.mostrar_popup,
            creado_por_email=creador.email if creador else None,
            fecha_creacion=anuncio.fecha_creacion,
            leido=anuncio.id in leidos_ids
        ))
    
    return resultado


@router.post("/{anuncio_id}/marcar-leido")
async def marcar_anuncio_leido(
    anuncio_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Marcar un anuncio como leído por el usuario actual"""
    # Verificar que el anuncio existe
    anuncio = db.query(Anuncio).filter(Anuncio.id == anuncio_id).first()
    if not anuncio:
        raise HTTPException(status_code=404, detail="Anuncio no encontrado")
    
    # Verificar si ya está marcado como leído
    ya_leido = db.query(AnuncioLeido).filter(
        AnuncioLeido.usuario_id == current_user.id,
        AnuncioLeido.anuncio_id == anuncio_id
    ).first()
    
    if ya_leido:
        return {"message": "Anuncio ya marcado como leído"}
    
    try:
        lectura = AnuncioLeido(
            usuario_id=current_user.id,
            anuncio_id=anuncio_id
        )
        db.add(lectura)
        db.commit()
        return {"message": "Anuncio marcado como leído"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error marcando anuncio como leído: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al marcar anuncio como leído"
        )


@router.post("/marcar-todos-leidos")
async def marcar_todos_leidos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Marcar todos los anuncios activos como leídos"""
    try:
        # Obtener anuncios activos no leídos
        leidos_ids = db.query(AnuncioLeido.anuncio_id).filter(
            AnuncioLeido.usuario_id == current_user.id
        ).all()
        leidos_ids = [l[0] for l in leidos_ids]
        
        query = db.query(Anuncio).filter(Anuncio.activo == True)
        if leidos_ids:
            query = query.filter(~Anuncio.id.in_(leidos_ids))
        anuncios_no_leidos = query.all()
        
        for anuncio in anuncios_no_leidos:
            lectura = AnuncioLeido(
                usuario_id=current_user.id,
                anuncio_id=anuncio.id
            )
            db.add(lectura)
        
        db.commit()
        return {"message": f"{len(anuncios_no_leidos)} anuncios marcados como leídos"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error marcando anuncios como leídos: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al marcar anuncios como leídos"
        )
