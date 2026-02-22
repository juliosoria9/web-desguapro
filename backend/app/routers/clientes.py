"""
Router para gestión de clientes interesados (módulo Ventas)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
import logging

from app.database import get_db
from app.models.busqueda import ClienteInteresado, Usuario
from app.schemas.clientes import (
    ClienteInteresadoCreate,
    ClienteInteresadoUpdate,
    ClienteInteresadoResponse,
)
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_entorno_id(usuario, entorno_id_param: Optional[int] = None) -> int:
    if str(usuario.rol) == "sysowner" and entorno_id_param:
        return entorno_id_param
    return int(usuario.entorno_trabajo_id)


def _build_response(c, db) -> ClienteInteresadoResponse:
    """Construye la respuesta a partir de un objeto ClienteInteresado"""
    usr_email = None
    if c.usuario_id:
        usr = db.query(Usuario.email).filter(Usuario.id == c.usuario_id).first()
        if usr:
            usr_email = str(usr[0])
    resp = ClienteInteresadoResponse.model_validate(c)
    resp.usuario_email = usr_email
    return resp


@router.get("", response_model=list[ClienteInteresadoResponse])
async def listar_clientes(
    estado: Optional[str] = Query(None, description="Filtrar por estado"),
    buscar: Optional[str] = Query(None, description="Buscar por nombre/teléfono/pieza"),
    entorno_id: Optional[int] = Query(None),
    limite: int = Query(200, ge=1, le=2000),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    ent_id = _get_entorno_id(usuario, entorno_id)

    query = db.query(ClienteInteresado).filter(
        ClienteInteresado.entorno_trabajo_id == ent_id
    )

    if estado:
        query = query.filter(ClienteInteresado.estado == estado)

    if buscar:
        buscar_like = f"%{buscar.strip()}%"
        query = query.filter(
            (ClienteInteresado.nombre.ilike(buscar_like)) |
            (ClienteInteresado.telefono.ilike(buscar_like)) |
            (ClienteInteresado.pieza_buscada.ilike(buscar_like)) |
            (ClienteInteresado.marca_coche.ilike(buscar_like))
        )

    clientes = query.order_by(desc(ClienteInteresado.fecha_registro)).limit(limite).all()
    return [_build_response(c, db) for c in clientes]


@router.get("/verificar-duplicados")
async def verificar_duplicados(
    nombre: Optional[str] = Query(None),
    telefono: Optional[str] = Query(None),
    email: Optional[str] = Query(None),
    excluir_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    """Busca clientes existentes que coincidan por nombre, teléfono o email."""
    ent_id = _get_entorno_id(usuario)
    from sqlalchemy import or_, func
    filtros = []
    if nombre and nombre.strip():
        filtros.append(func.lower(ClienteInteresado.nombre) == nombre.strip().lower())
    if telefono and telefono.strip():
        filtros.append(ClienteInteresado.telefono == telefono.strip())
    if email and email.strip():
        filtros.append(func.lower(ClienteInteresado.email) == email.strip().lower())
    if not filtros:
        return []
    query = db.query(ClienteInteresado).filter(
        ClienteInteresado.entorno_trabajo_id == ent_id,
        or_(*filtros),
    )
    if excluir_id:
        query = query.filter(ClienteInteresado.id != excluir_id)
    coincidencias = query.limit(20).all()
    resultado = []
    for c in coincidencias:
        motivos = []
        if nombre and nombre.strip() and str(c.nombre).lower() == nombre.strip().lower():
            motivos.append("nombre")
        if telefono and telefono.strip() and str(c.telefono or "") == telefono.strip():
            motivos.append("teléfono")
        if email and email.strip() and str(c.email or "").lower() == email.strip().lower():
            motivos.append("email")
        vehiculo = " ".join(filter(None, [str(c.marca_coche or ""), str(c.modelo_coche or ""), str(c.anio_coche or "")]))
        resultado.append({
            "id": int(c.id),
            "nombre": str(c.nombre),
            "telefono": str(c.telefono or ""),
            "email": str(c.email or ""),
            "vehiculo": vehiculo,
            "pieza_buscada": str(c.pieza_buscada or ""),
            "estado": str(c.estado),
            "coincide_por": motivos,
        })
    return resultado


@router.post("", response_model=ClienteInteresadoResponse)
async def crear_cliente(
    datos: ClienteInteresadoCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    ent_id = _get_entorno_id(usuario, datos.entorno_id)
    if not ent_id:
        raise HTTPException(status_code=400, detail="Selecciona una empresa")

    cliente = ClienteInteresado(
        entorno_trabajo_id=ent_id,
        usuario_id=usuario.id,
        nombre=datos.nombre.strip(),
        email=datos.email.strip() if datos.email else None,
        telefono=datos.telefono.strip() if datos.telefono else None,
        pieza_buscada=datos.pieza_buscada.strip() if datos.pieza_buscada else None,
        marca_coche=datos.marca_coche.strip() if datos.marca_coche else None,
        modelo_coche=datos.modelo_coche.strip() if datos.modelo_coche else None,
        anio_coche=datos.anio_coche.strip() if datos.anio_coche else None,
        version_coche=datos.version_coche.strip() if datos.version_coche else None,
        observaciones=datos.observaciones.strip() if datos.observaciones else None,
    )
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    logger.info(f"Cliente '{cliente.nombre}' creado por {usuario.email}")
    return _build_response(cliente, db)


@router.put("/{cliente_id}", response_model=ClienteInteresadoResponse)
async def editar_cliente(
    cliente_id: int,
    datos: ClienteInteresadoUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    cliente = db.query(ClienteInteresado).filter(ClienteInteresado.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    ent_id = _get_entorno_id(usuario)
    if int(cliente.entorno_trabajo_id) != ent_id and str(usuario.rol) != "sysowner":
        raise HTTPException(status_code=403, detail="No tienes acceso a este cliente")

    for field in ["nombre", "email", "telefono", "pieza_buscada", "marca_coche", "modelo_coche", "anio_coche", "version_coche", "observaciones", "estado"]:
        val = getattr(datos, field, None)
        if val is not None:
            setattr(cliente, field, val.strip() if isinstance(val, str) else val)

    db.commit()
    db.refresh(cliente)
    logger.info(f"Cliente {cliente_id} editado por {usuario.email}")
    return _build_response(cliente, db)


@router.delete("/{cliente_id}")
async def borrar_cliente(
    cliente_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    if str(usuario.rol) not in ["admin", "owner", "sysowner"]:
        raise HTTPException(status_code=403, detail="Solo administradores pueden borrar clientes")

    cliente = db.query(ClienteInteresado).filter(ClienteInteresado.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    ent_id = _get_entorno_id(usuario)
    if int(cliente.entorno_trabajo_id) != ent_id and str(usuario.rol) != "sysowner":
        raise HTTPException(status_code=403, detail="No tienes acceso a este cliente")

    db.delete(cliente)
    db.commit()
    logger.info(f"Cliente {cliente_id} borrado por {usuario.email}")
    return {"message": "Cliente eliminado"}
