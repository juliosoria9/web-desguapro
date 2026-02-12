"""
Router para sistema de tickets de soporte con chat
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.dependencies import get_current_user
from app.models.busqueda import Ticket, TicketMensaje, Usuario, EntornoTrabajo

router = APIRouter(tags=["tickets"])


# ============== SCHEMAS ==============
class TicketCreate(BaseModel):
    tipo: str  # reporte, sugerencia, duda, otro
    asunto: str
    descripcion: str
    prioridad: str = "normal"  # baja, normal, alta, urgente


class MensajeCreate(BaseModel):
    mensaje: str


class MensajeResponse(BaseModel):
    id: int
    mensaje: str
    es_soporte: bool
    usuario_nombre: str
    usuario_email: str
    fecha_creacion: datetime
    
    class Config:
        from_attributes = True


class TicketResponse(BaseModel):
    id: int
    tipo: str
    asunto: str
    descripcion: str
    estado: str
    prioridad: str
    fecha_creacion: datetime
    fecha_actualizacion: datetime
    usuario_email: str
    usuario_nombre: Optional[str]
    empresa_nombre: str
    mensajes: List[MensajeResponse] = []
    
    class Config:
        from_attributes = True


class TicketListItem(BaseModel):
    id: int
    tipo: str
    asunto: str
    estado: str
    prioridad: str
    fecha_creacion: datetime
    usuario_email: str
    usuario_nombre: Optional[str]
    empresa_nombre: str
    tiene_respuesta: bool
    ultimo_mensaje_fecha: Optional[datetime]
    
    class Config:
        from_attributes = True


class CambiarEstado(BaseModel):
    estado: str


# ============== ENDPOINTS ==============
@router.post("/crear", response_model=TicketResponse)
async def crear_ticket(
    ticket: TicketCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Crear un nuevo ticket de soporte"""
    if not ticket.asunto.strip():
        raise HTTPException(status_code=400, detail="El asunto no puede estar vacío")
    
    if not ticket.descripcion.strip():
        raise HTTPException(status_code=400, detail="La descripción no puede estar vacía")
    
    if ticket.tipo not in ["reporte", "sugerencia", "duda", "otro"]:
        raise HTTPException(status_code=400, detail="Tipo de ticket inválido")
    
    if ticket.prioridad not in ["baja", "normal", "alta", "urgente"]:
        raise HTTPException(status_code=400, detail="Prioridad inválida")
    
    nuevo_ticket = Ticket(
        entorno_trabajo_id=current_user.entorno_trabajo_id,
        usuario_id=current_user.id,
        tipo=ticket.tipo,
        asunto=ticket.asunto.strip(),
        descripcion=ticket.descripcion.strip(),
        prioridad=ticket.prioridad,
        estado="abierto"
    )
    
    db.add(nuevo_ticket)
    db.commit()
    db.refresh(nuevo_ticket)
    
    entorno = db.query(EntornoTrabajo).filter(
        EntornoTrabajo.id == current_user.entorno_trabajo_id
    ).first()
    
    return TicketResponse(
        id=nuevo_ticket.id,
        tipo=nuevo_ticket.tipo,
        asunto=nuevo_ticket.asunto,
        descripcion=nuevo_ticket.descripcion,
        estado=nuevo_ticket.estado,
        prioridad=nuevo_ticket.prioridad,
        fecha_creacion=nuevo_ticket.fecha_creacion,
        fecha_actualizacion=nuevo_ticket.fecha_actualizacion,
        usuario_email=current_user.email,
        usuario_nombre=current_user.nombre,
        empresa_nombre=entorno.nombre if entorno else "Sin empresa",
        mensajes=[]
    )


@router.post("/{ticket_id}/mensaje", response_model=MensajeResponse)
async def enviar_mensaje(
    ticket_id: int,
    mensaje: MensajeCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Enviar un mensaje en un ticket (chat)"""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    
    # Solo el creador o sysowner puede enviar mensajes
    if ticket.usuario_id != current_user.id and current_user.rol != "sysowner":
        raise HTTPException(status_code=403, detail="No tienes permisos para este ticket")
    
    if ticket.estado == "cerrado":
        raise HTTPException(status_code=400, detail="No puedes enviar mensajes a un ticket cerrado")
    
    if not mensaje.mensaje.strip():
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío")
    
    # Determinar si es mensaje de soporte
    es_soporte = current_user.rol == "sysowner"
    
    nuevo_mensaje = TicketMensaje(
        ticket_id=ticket_id,
        usuario_id=current_user.id,
        mensaje=mensaje.mensaje.strip(),
        es_soporte=es_soporte
    )
    
    db.add(nuevo_mensaje)
    
    # Si es sysowner respondiendo, cambiar estado a en_proceso si estaba abierto
    if es_soporte and ticket.estado == "abierto":
        ticket.estado = "en_proceso"
    
    db.commit()
    db.refresh(nuevo_mensaje)
    
    return MensajeResponse(
        id=nuevo_mensaje.id,
        mensaje=nuevo_mensaje.mensaje,
        es_soporte=nuevo_mensaje.es_soporte,
        usuario_nombre=current_user.nombre or current_user.email.split('@')[0],
        usuario_email=current_user.email,
        fecha_creacion=nuevo_mensaje.fecha_creacion
    )


@router.get("/mis-tickets", response_model=List[TicketListItem])
async def obtener_mis_tickets(
    estado: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener mis tickets"""
    query = db.query(Ticket).filter(Ticket.usuario_id == current_user.id)
    
    if estado:
        query = query.filter(Ticket.estado == estado)
    
    tickets = query.order_by(desc(Ticket.fecha_actualizacion)).all()
    
    entorno = db.query(EntornoTrabajo).filter(
        EntornoTrabajo.id == current_user.entorno_trabajo_id
    ).first()
    
    resultado = []
    for t in tickets:
        # Verificar si tiene mensajes de soporte
        tiene_respuesta = db.query(TicketMensaje).filter(
            TicketMensaje.ticket_id == t.id,
            TicketMensaje.es_soporte == True
        ).first() is not None
        
        # Último mensaje
        ultimo_msg = db.query(TicketMensaje).filter(
            TicketMensaje.ticket_id == t.id
        ).order_by(desc(TicketMensaje.fecha_creacion)).first()
        
        resultado.append(TicketListItem(
            id=t.id,
            tipo=t.tipo,
            asunto=t.asunto,
            estado=t.estado,
            prioridad=t.prioridad,
            fecha_creacion=t.fecha_creacion,
            usuario_email=current_user.email,
            usuario_nombre=current_user.nombre,
            empresa_nombre=entorno.nombre if entorno else "Sin empresa",
            tiene_respuesta=tiene_respuesta,
            ultimo_mensaje_fecha=ultimo_msg.fecha_creacion if ultimo_msg else None
        ))
    
    return resultado


@router.get("/todos", response_model=List[TicketListItem])
async def obtener_todos_tickets(
    estado: Optional[str] = None,
    entorno_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener todos los tickets (solo sysowner)"""
    if current_user.rol != "sysowner":
        raise HTTPException(status_code=403, detail="No tienes permisos")
    
    query = db.query(Ticket)
    
    if estado:
        query = query.filter(Ticket.estado == estado)
    
    if entorno_id:
        query = query.filter(Ticket.entorno_trabajo_id == entorno_id)
    
    tickets = query.order_by(desc(Ticket.fecha_actualizacion)).all()
    
    resultado = []
    for t in tickets:
        usuario = db.query(Usuario).filter(Usuario.id == t.usuario_id).first()
        entorno = db.query(EntornoTrabajo).filter(EntornoTrabajo.id == t.entorno_trabajo_id).first()
        
        tiene_respuesta = db.query(TicketMensaje).filter(
            TicketMensaje.ticket_id == t.id,
            TicketMensaje.es_soporte == True
        ).first() is not None
        
        ultimo_msg = db.query(TicketMensaje).filter(
            TicketMensaje.ticket_id == t.id
        ).order_by(desc(TicketMensaje.fecha_creacion)).first()
        
        resultado.append(TicketListItem(
            id=t.id,
            tipo=t.tipo,
            asunto=t.asunto,
            estado=t.estado,
            prioridad=t.prioridad,
            fecha_creacion=t.fecha_creacion,
            usuario_email=usuario.email if usuario else "Desconocido",
            usuario_nombre=usuario.nombre if usuario else None,
            empresa_nombre=entorno.nombre if entorno else "Sin empresa",
            tiene_respuesta=tiene_respuesta,
            ultimo_mensaje_fecha=ultimo_msg.fecha_creacion if ultimo_msg else None
        ))
    
    return resultado


@router.get("/{ticket_id}", response_model=TicketResponse)
async def obtener_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener un ticket con todos sus mensajes"""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    
    # Solo el creador o sysowner puede ver el ticket
    if ticket.usuario_id != current_user.id and current_user.rol != "sysowner":
        raise HTTPException(status_code=403, detail="No tienes permisos")
    
    usuario = db.query(Usuario).filter(Usuario.id == ticket.usuario_id).first()
    entorno = db.query(EntornoTrabajo).filter(EntornoTrabajo.id == ticket.entorno_trabajo_id).first()
    
    # Obtener mensajes
    mensajes = db.query(TicketMensaje).filter(
        TicketMensaje.ticket_id == ticket_id
    ).order_by(TicketMensaje.fecha_creacion).all()
    
    mensajes_response = []
    for m in mensajes:
        msg_usuario = db.query(Usuario).filter(Usuario.id == m.usuario_id).first()
        mensajes_response.append(MensajeResponse(
            id=m.id,
            mensaje=m.mensaje,
            es_soporte=m.es_soporte,
            usuario_nombre=msg_usuario.nombre or msg_usuario.email.split('@')[0] if msg_usuario else "Desconocido",
            usuario_email=msg_usuario.email if msg_usuario else "",
            fecha_creacion=m.fecha_creacion
        ))
    
    return TicketResponse(
        id=ticket.id,
        tipo=ticket.tipo,
        asunto=ticket.asunto,
        descripcion=ticket.descripcion,
        estado=ticket.estado,
        prioridad=ticket.prioridad,
        fecha_creacion=ticket.fecha_creacion,
        fecha_actualizacion=ticket.fecha_actualizacion,
        usuario_email=usuario.email if usuario else "Desconocido",
        usuario_nombre=usuario.nombre if usuario else None,
        empresa_nombre=entorno.nombre if entorno else "Sin empresa",
        mensajes=mensajes_response
    )


@router.put("/{ticket_id}/estado")
async def cambiar_estado_ticket(
    ticket_id: int,
    datos: CambiarEstado,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Cambiar estado de un ticket (solo sysowner)"""
    if current_user.rol != "sysowner":
        raise HTTPException(status_code=403, detail="Solo el administrador puede cambiar el estado")
    
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    
    if datos.estado not in ["abierto", "en_proceso", "resuelto", "cerrado"]:
        raise HTTPException(status_code=400, detail="Estado inválido")
    
    ticket.estado = datos.estado
    db.commit()
    
    return {"success": True, "estado": datos.estado}


@router.delete("/{ticket_id}")
async def eliminar_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Eliminar un ticket"""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    
    # Sysowner puede eliminar cualquiera, creador solo si está abierto
    if current_user.rol != "sysowner":
        if ticket.usuario_id != current_user.id:
            raise HTTPException(status_code=403, detail="No tienes permisos")
        if ticket.estado != "abierto":
            raise HTTPException(status_code=400, detail="Solo puedes eliminar tickets abiertos")
    
    # Eliminar mensajes primero
    db.query(TicketMensaje).filter(TicketMensaje.ticket_id == ticket_id).delete()
    db.delete(ticket)
    db.commit()
    
    return {"success": True, "message": "Ticket eliminado"}


@router.get("/estadisticas/resumen")
async def obtener_estadisticas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener estadísticas de tickets (solo sysowner)"""
    if current_user.rol != "sysowner":
        raise HTTPException(status_code=403, detail="No tienes permisos")
    
    total = db.query(Ticket).count()
    abiertos = db.query(Ticket).filter(Ticket.estado == "abierto").count()
    en_proceso = db.query(Ticket).filter(Ticket.estado == "en_proceso").count()
    resueltos = db.query(Ticket).filter(Ticket.estado == "resuelto").count()
    cerrados = db.query(Ticket).filter(Ticket.estado == "cerrado").count()
    
    urgentes_pendientes = db.query(Ticket).filter(
        Ticket.prioridad == "urgente",
        Ticket.estado.in_(["abierto", "en_proceso"])
    ).count()
    
    return {
        "total": total,
        "por_estado": {
            "abiertos": abiertos,
            "en_proceso": en_proceso,
            "resueltos": resueltos,
            "cerrados": cerrados
        },
        "urgentes_pendientes": urgentes_pendientes
    }
