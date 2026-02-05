"""
Router para autenticación y gestión de usuarios
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, status, Query, Response, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func
from datetime import datetime, timedelta
import logging

from app.database import get_db
from app.config import settings
from app.models.busqueda import Usuario, EntornoTrabajo, Busqueda
from app.schemas.auth import (
    LoginRequest, LoginResponse, UsuarioCreate, UsuarioResponse,
    UsuarioListResponse, EntornoTrabajoCreate, EntornoTrabajoResponse, EntornoModulosUpdate
)
from app.dependencies import get_current_user, get_current_owner, get_current_admin, get_current_sysowner
from utils.security import (
    hash_password, verify_password, create_access_token, TokenData
)
from utils.timezone import now_spain_naive
from services.audit import AuditService

logger = logging.getLogger(__name__)
router = APIRouter()


# ============== LOGIN ==============
@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, req: Request, db: Session = Depends(get_db)):
    """Login de usuario"""
    try:
        # Obtener IP del cliente
        client_ip = req.client.host if req.client else None
        user_agent = req.headers.get("user-agent", "")[:255]
        
        # Buscar usuario
        usuario = db.query(Usuario).filter(
            Usuario.email == request.email
        ).first()
        
        if not usuario or not usuario.activo:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Email o contraseña incorrectos",
            )
        
        # Verificar contraseña
        if not verify_password(request.password, usuario.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Email o contraseña incorrectos",
            )
        
        # Log de login exitoso (desactivado temporalmente)
        # AuditService.log_login(db, usuario, client_ip, user_agent, exitoso=True)
        
        # Crear token
        token_data = {
            "usuario_id": usuario.id,
            "email": usuario.email,
            "rol": usuario.rol,
            "entorno_trabajo_id": usuario.entorno_trabajo_id,
        }
        access_token = create_access_token(token_data)
        
        # Obtener nombre del entorno
        entorno_nombre = None
        modulos = None
        if usuario.entorno_trabajo_id:
            entorno = db.query(EntornoTrabajo).filter(EntornoTrabajo.id == usuario.entorno_trabajo_id).first()
            if entorno:
                entorno_nombre = entorno.nombre
                # Incluir módulos activos
                modulos = {
                    "fichadas": entorno.modulo_fichadas if entorno.modulo_fichadas is not None else True,
                    "stock_masivo": entorno.modulo_stock_masivo if entorno.modulo_stock_masivo is not None else True,
                    "referencias": entorno.modulo_referencias if entorno.modulo_referencias is not None else True,
                    "piezas_nuevas": entorno.modulo_piezas_nuevas if entorno.modulo_piezas_nuevas is not None else True,
                    "ventas": entorno.modulo_ventas if entorno.modulo_ventas is not None else True,
                    "precios_sugeridos": entorno.modulo_precios_sugeridos if entorno.modulo_precios_sugeridos is not None else True,
                    "importacion_csv": entorno.modulo_importacion_csv if entorno.modulo_importacion_csv is not None else True,
                    "inventario_piezas": entorno.modulo_inventario_piezas if hasattr(entorno, 'modulo_inventario_piezas') and entorno.modulo_inventario_piezas is not None else True,
                    "estudio_coches": entorno.modulo_estudio_coches if hasattr(entorno, 'modulo_estudio_coches') and entorno.modulo_estudio_coches is not None else True,
                }
        
        # Crear response con entorno_nombre y módulos
        usuario_response = UsuarioResponse(
            id=usuario.id,
            email=usuario.email,
            nombre=usuario.nombre,
            rol=usuario.rol,
            activo=usuario.activo,
            entorno_trabajo_id=usuario.entorno_trabajo_id,
            entorno_nombre=entorno_nombre,
            fecha_creacion=usuario.fecha_creacion,
            modulos=modulos,
        )
        
        # Crear respuesta con cookie HTTPOnly
        response = JSONResponse(
            content={
                "access_token": access_token,
                "usuario": usuario_response.model_dump(mode='json')
            }
        )
        
        # Configurar cookie HTTPOnly segura
        response.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,  # No accesible desde JavaScript
            secure=settings.cookie_secure,  # True en producción (HTTPS)
            samesite="lax",  # Protección CSRF
            max_age=60 * 60 * 24,  # 24 horas
            path="/"
        )
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en login: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al iniciar sesión",
        )


@router.post("/logout")
async def logout(
    response: Response,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Cerrar sesión - elimina la cookie de autenticación"""
    # Log de logout
    AuditService.log_logout(db, current_user)
    
    response.delete_cookie(
        key="access_token",
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax"
    )
    return {"message": "Sesión cerrada correctamente"}


@router.get("/me", response_model=UsuarioResponse)
async def obtener_usuario_actual(
    usuario: Usuario = Depends(get_current_user)
):
    """Obtener datos del usuario actual"""
    return UsuarioResponse.model_validate(usuario)


# ============== VER CONTRASEÑA (SEGÚN JERARQUÍA) ==============
@router.get("/usuarios/{usuario_id}/password")
async def ver_password_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_admin)
):
    """
    Ver contraseña de un usuario (ADMIN o OWNER según jerarquía)
    - OWNER puede ver todas las contraseñas
    - ADMIN solo puede ver contraseñas de usuarios (no admin ni owner)
    """
    try:
        usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
        if not usuario:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado",
            )
        
        # Permitir ver su propia contraseña
        es_propio = usuario.id == usuario_actual.id
        
        # Jerarquía de roles: sysowner > owner > admin > user
        rol_jerarquia = {"sysowner": 4, "owner": 3, "admin": 2, "user": 1}
        mi_nivel = rol_jerarquia.get(usuario_actual.rol, 0)
        su_nivel = rol_jerarquia.get(usuario.rol, 0)
        
        # Solo puede ver contraseñas de usuarios de menor rango (o la propia)
        if not es_propio and su_nivel >= mi_nivel:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No puedes ver la contraseña de un usuario de igual o mayor rango",
            )
        
        # Admin y Owner solo pueden ver contraseñas de usuarios de su mismo entorno (excepto la propia)
        if not es_propio and usuario_actual.rol in ["admin", "owner"]:
            if usuario.entorno_trabajo_id != usuario_actual.entorno_trabajo_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Solo puedes ver contraseñas de usuarios de tu empresa",
                )
        
        if not usuario.password_plain:
            return {"password": "(no disponible - usuario antiguo)"}
        
        return {"password": usuario.password_plain}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error viendo contraseña: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al obtener contraseña",
        )


# ============== GESTIÓN DE USUARIOS (OWNER/SYSOWNER) ==============
@router.post("/usuarios", response_model=UsuarioResponse)
async def crear_usuario(
    request: UsuarioCreate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_owner)
):
    """
    Crear nuevo usuario (OWNER o SYSOWNER)
    - SYSOWNER puede crear cualquier rol incluyendo owner
    - OWNER solo puede crear admin y user en su empresa
    """
    try:
        # Verificar que no existe
        existente = db.query(Usuario).filter(
            Usuario.email == request.email
        ).first()
        
        if existente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El usuario ya existe",
            )
        
        # Validar rol (ahora usamos strings directamente)
        roles_validos = ["user", "admin", "owner", "sysowner"]
        
        rol_lower = request.rol.lower()
        if rol_lower not in roles_validos:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Rol inválido. Use: user, admin, owner, sysowner",
            )
        
        # Verificar permisos según jerarquía
        # Solo sysowner puede crear owner o sysowner
        if rol_lower in ["owner", "sysowner"] and usuario_actual.rol != "sysowner":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo el propietario de sistema puede crear propietarios",
            )
        
        # Crear usuario
        # Si se proporciona entorno_trabajo_id, usarlo; si no, usar el del creador
        entorno_id = request.entorno_trabajo_id if request.entorno_trabajo_id else usuario_actual.entorno_trabajo_id
        
        nuevo_usuario = Usuario(
            email=request.email,
            nombre=request.nombre,
            password_hash=hash_password(request.password),
            password_plain=request.password,  # Guardar contraseña en texto plano
            rol=rol_lower,
            entorno_trabajo_id=entorno_id
        )
        
        db.add(nuevo_usuario)
        db.commit()
        db.refresh(nuevo_usuario)
        
        logger.info(f"Usuario creado: {request.email}")
        
        return UsuarioResponse.model_validate(nuevo_usuario)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creando usuario: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al crear usuario",
        )


@router.delete("/usuarios/{usuario_id}")
async def eliminar_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_admin)  # Admin o Owner pueden eliminar
):
    """Eliminar un usuario (ADMIN o OWNER con restricciones de jerarquía)"""
    try:
        usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
        if not usuario:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado",
            )
        
        # No permitir eliminar al propio usuario
        if usuario.id == usuario_actual.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No puedes eliminarte a ti mismo",
            )
        
        # Jerarquía de roles: sysowner > owner > admin > user
        rol_jerarquia = {"sysowner": 4, "owner": 3, "admin": 2, "user": 1}
        mi_nivel = rol_jerarquia.get(usuario_actual.rol, 0)
        su_nivel = rol_jerarquia.get(usuario.rol, 0)
        
        # Solo puede eliminar usuarios de menor rango
        if su_nivel >= mi_nivel:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No puedes eliminar a un usuario de igual o mayor rango",
            )
        
        # Admin y Owner solo pueden eliminar usuarios de su mismo entorno
        if usuario_actual.rol in ["admin", "owner"]:
            if usuario.entorno_trabajo_id != usuario_actual.entorno_trabajo_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Solo puedes eliminar usuarios de tu empresa",
                )
        
        db.delete(usuario)
        db.commit()
        
        logger.info(f"Usuario eliminado: {usuario.email} por {usuario_actual.email}")
        return {"mensaje": "Usuario eliminado"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error eliminando usuario: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al eliminar usuario",
        )


@router.put("/usuarios/{usuario_id}")
async def actualizar_usuario(
    usuario_id: int,
    usuario: str = None,
    password: str = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_admin)
):
    """Actualizar usuario y/o contraseña de un usuario (ADMIN o OWNER según jerarquía, o el propio usuario)"""
    try:
        usuario_db = db.query(Usuario).filter(Usuario.id == usuario_id).first()
        if not usuario_db:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado",
            )
        
        # Permitir editar su propio perfil
        es_propio = usuario_db.id == usuario_actual.id
        
        # Jerarquía de roles: sysowner > owner > admin > user
        rol_jerarquia = {"sysowner": 4, "owner": 3, "admin": 2, "user": 1}
        mi_nivel = rol_jerarquia.get(usuario_actual.rol, 0)
        su_nivel = rol_jerarquia.get(usuario_db.rol, 0)
        
        # Solo puede editar usuarios de menor rango (o a sí mismo)
        if not es_propio and su_nivel >= mi_nivel:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No puedes editar a un usuario de igual o mayor rango",
            )
        
        # Admin y Owner solo pueden editar usuarios de su mismo entorno (excepto a sí mismos)
        if not es_propio and usuario_actual.rol in ["admin", "owner"]:
            if usuario_db.entorno_trabajo_id != usuario_actual.entorno_trabajo_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Solo puedes editar usuarios de tu empresa",
                )
        
        # Actualizar nombre de usuario
        if usuario is not None and usuario.strip():
            # Verificar que no exista otro usuario con ese nombre
            existente = db.query(Usuario).filter(
                Usuario.email == usuario.strip(),
                Usuario.id != usuario_id
            ).first()
            if existente:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Ya existe un usuario con ese nombre",
                )
            usuario_db.email = usuario.strip()
        
        if password is not None and password.strip():
            usuario_db.password_hash = hash_password(password)
            usuario_db.password_plain = password
        
        db.commit()
        db.refresh(usuario_db)
        
        logger.info(f"Usuario actualizado: {usuario_db.email} por {usuario_actual.email}")
        return UsuarioResponse.model_validate(usuario_db)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error actualizando usuario: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al actualizar usuario",
        )


@router.put("/usuarios/{usuario_id}/rol")
async def cambiar_rol_usuario(
    usuario_id: int,
    nuevo_rol: str,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_owner)
):
    """Cambiar el rol de un usuario (solo OWNER)"""
    try:
        usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
        if not usuario:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado",
            )
        
        # Validar rol (ahora usamos strings directamente)
        roles_validos = ["user", "admin", "owner", "sysowner"]
        
        rol_lower = nuevo_rol.lower()
        if rol_lower not in roles_validos:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Rol inválido. Use: user, admin, owner, sysowner",
            )
        
        usuario.rol = rol_lower
        db.commit()
        
        logger.info(f"Rol cambiado: {usuario.email} -> {nuevo_rol}")
        return UsuarioResponse.model_validate(usuario)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error cambiando rol: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al cambiar rol",
        )


@router.get("/usuarios", response_model=UsuarioListResponse)
async def listar_usuarios(
    entorno_id: int = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_owner)
):
    """
    Listar usuarios (OWNER o SYSOWNER)
    - SYSOWNER puede ver todos los usuarios o filtrar por entorno
    - OWNER solo puede ver usuarios de su propio entorno
    """
    if usuario_actual.rol == "sysowner":
        # Sysowner puede ver todos o filtrar
        if entorno_id:
            usuarios = db.query(Usuario).filter(Usuario.entorno_trabajo_id == entorno_id).all()
        else:
            usuarios = db.query(Usuario).all()
    else:
        # Owner solo ve usuarios de su empresa
        usuarios = db.query(Usuario).filter(
            Usuario.entorno_trabajo_id == usuario_actual.entorno_trabajo_id
        ).all()
    
    return UsuarioListResponse(
        total=len(usuarios),
        usuarios=[UsuarioResponse.model_validate(u) for u in usuarios]
    )


@router.post("/usuarios/{usuario_id}/entorno/{entorno_id}")
async def asignar_entorno_trabajo(
    usuario_id: int,
    entorno_id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_sysowner)
):
    """Asignar entorno de trabajo a un usuario (solo SYSOWNER)"""
    try:
        # Verificar usuario
        usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
        if not usuario:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado",
            )
        
        # Verificar entorno
        entorno = db.query(EntornoTrabajo).filter(
            EntornoTrabajo.id == entorno_id
        ).first()
        if not entorno:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Entorno de trabajo no encontrado",
            )
        
        # Asignar
        usuario.entorno_trabajo_id = entorno_id
        db.commit()
        
        return {"mensaje": "Entorno asignado"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error asignando entorno: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al asignar entorno",
        )


# ============== ENTORNOS DE TRABAJO (SOLO SYSOWNER) ==============
@router.post("/entornos", response_model=EntornoTrabajoResponse)
async def crear_entorno(
    request: EntornoTrabajoCreate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_sysowner)
):
    """Crear nuevo entorno de trabajo (solo SYSOWNER)"""
    try:
        # Verificar que no existe
        existente = db.query(EntornoTrabajo).filter(
            EntornoTrabajo.nombre == request.nombre
        ).first()
        
        if existente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ya existe un entorno con ese nombre",
            )
        
        # Crear entorno
        nuevo_entorno = EntornoTrabajo(
            nombre=request.nombre,
            descripcion=request.descripcion,
            owner_id=usuario_actual.id
        )
        
        db.add(nuevo_entorno)
        db.commit()
        db.refresh(nuevo_entorno)
        
        logger.info(f"Entorno creado: {request.nombre}")
        
        return EntornoTrabajoResponse.model_validate(nuevo_entorno)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creando entorno: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al crear entorno",
        )


@router.get("/entornos", response_model=list[EntornoTrabajoResponse])
async def listar_entornos(
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_sysowner)
):
    """Listar todos los entornos de trabajo (solo SYSOWNER)"""
    entornos = db.query(EntornoTrabajo).all()
    
    return [EntornoTrabajoResponse.model_validate(e) for e in entornos]


@router.delete("/entornos/{entorno_id}")
async def eliminar_entorno(
    entorno_id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_sysowner)
):
    """Eliminar un entorno de trabajo y todos sus usuarios (solo SYSOWNER)"""
    try:
        entorno = db.query(EntornoTrabajo).filter(EntornoTrabajo.id == entorno_id).first()
        if not entorno:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Entorno no encontrado",
            )
        
        # Contar usuarios en este entorno (excluyendo sysowner)
        usuarios_count = db.query(Usuario).filter(
            Usuario.entorno_trabajo_id == entorno_id,
            Usuario.rol != "sysowner"
        ).count()
        
        # Eliminar usuarios del entorno primero (NUNCA eliminar sysowner)
        db.query(Usuario).filter(
            Usuario.entorno_trabajo_id == entorno_id,
            Usuario.rol != "sysowner"
        ).delete()
        
        # Eliminar el entorno
        db.delete(entorno)
        db.commit()
        
        logger.info(f"Entorno eliminado: {entorno.nombre} ({usuarios_count} usuarios) por {usuario_actual.email}")
        return {"message": f"Entorno '{entorno.nombre}' eliminado con {usuarios_count} usuario(s)"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error eliminando entorno: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al eliminar entorno",
        )


@router.put("/entornos/{entorno_id}/modulos", response_model=EntornoTrabajoResponse)
async def actualizar_modulos_entorno(
    entorno_id: int,
    modulos: EntornoModulosUpdate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_sysowner)
):
    """Actualizar módulos activos de un entorno de trabajo (solo SYSOWNER)"""
    try:
        entorno = db.query(EntornoTrabajo).filter(EntornoTrabajo.id == entorno_id).first()
        if not entorno:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Entorno no encontrado",
            )
        
        # Actualizar solo los módulos que se envíen
        if modulos.modulo_fichadas is not None:
            entorno.modulo_fichadas = modulos.modulo_fichadas
        if modulos.modulo_stock_masivo is not None:
            entorno.modulo_stock_masivo = modulos.modulo_stock_masivo
        if modulos.modulo_referencias is not None:
            entorno.modulo_referencias = modulos.modulo_referencias
        if modulos.modulo_piezas_nuevas is not None:
            entorno.modulo_piezas_nuevas = modulos.modulo_piezas_nuevas
        if modulos.modulo_ventas is not None:
            entorno.modulo_ventas = modulos.modulo_ventas
        if modulos.modulo_precios_sugeridos is not None:
            entorno.modulo_precios_sugeridos = modulos.modulo_precios_sugeridos
        if modulos.modulo_importacion_csv is not None:
            entorno.modulo_importacion_csv = modulos.modulo_importacion_csv
        if modulos.modulo_inventario_piezas is not None:
            entorno.modulo_inventario_piezas = modulos.modulo_inventario_piezas
        if modulos.modulo_estudio_coches is not None:
            entorno.modulo_estudio_coches = modulos.modulo_estudio_coches
        
        db.commit()
        db.refresh(entorno)
        
        logger.info(f"Módulos actualizados para entorno {entorno.nombre} por {usuario_actual.email}")
        return EntornoTrabajoResponse.model_validate(entorno)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error actualizando módulos: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al actualizar módulos",
        )


@router.get("/usuarios-admin", response_model=UsuarioListResponse)
async def listar_usuarios_admin(
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_admin)
):
    """Listar usuarios del mismo entorno (ADMIN)"""
    if not usuario_actual.entorno_trabajo_id:
        return UsuarioListResponse(total=0, usuarios=[])
    
    usuarios = db.query(Usuario).filter(
        Usuario.entorno_trabajo_id == usuario_actual.entorno_trabajo_id
    ).all()
    
    return UsuarioListResponse(
        total=len(usuarios),
        usuarios=[UsuarioResponse.model_validate(u) for u in usuarios]
    )


@router.post("/usuarios-admin", response_model=UsuarioResponse)
async def crear_usuario_admin(
    request: UsuarioCreate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_admin)
):
    """
    Crear usuario dentro del entorno (ADMIN o OWNER)
    El usuario se asigna automáticamente al entorno del admin
    """
    try:
        # Verificar que no existe
        existente = db.query(Usuario).filter(
            Usuario.email == request.email
        ).first()
        
        if existente:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El email ya existe",
            )
        
        # Solo crear "user"
        if request.rol != "user":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Solo se pueden crear usuarios normales",
            )
        
        # Crear usuario asignado al mismo entorno
        nuevo_usuario = Usuario(
            email=request.email,
            nombre=request.nombre,
            password_hash=hash_password(request.password),
            password_plain=request.password,  # Guardar contraseña en texto plano
            rol="user",
            entorno_trabajo_id=usuario_actual.entorno_trabajo_id
        )
        
        db.add(nuevo_usuario)
        db.commit()
        db.refresh(nuevo_usuario)
        
        logger.info(f"Usuario creado en entorno: {request.email}")
        
        return UsuarioResponse.model_validate(nuevo_usuario)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creando usuario admin: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al crear usuario",
        )


# ============== INFORMES DE USUARIO ==============
@router.get("/usuarios/{usuario_id}/informe")
async def obtener_informe_usuario(
    usuario_id: int,
    dias: int = Query(default=30, ge=1, le=365),
    fecha_inicio: Optional[str] = Query(default=None, description="Fecha inicio YYYY-MM-DD"),
    fecha_fin: Optional[str] = Query(default=None, description="Fecha fin YYYY-MM-DD"),
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_admin)
):
    """Obtener informe de actividad de un usuario"""
    try:
        usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
        if not usuario:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuario no encontrado",
            )
        
        # Verificar permisos (puede ver su propio informe o de usuarios de menor rango)
        rol_jerarquia = {"sysowner": 4, "owner": 3, "admin": 2, "user": 1}
        mi_nivel = rol_jerarquia.get(usuario_actual.rol, 0)
        su_nivel = rol_jerarquia.get(usuario.rol, 0)
        es_propio = usuario.id == usuario_actual.id
        
        if not es_propio and su_nivel >= mi_nivel:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No puedes ver el informe de un usuario de igual o mayor rango",
            )
        
        # Verificar mismo entorno para admin/owner
        if not es_propio and usuario_actual.rol in ["admin", "owner"]:
            if usuario.entorno_trabajo_id != usuario_actual.entorno_trabajo_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Solo puedes ver informes de usuarios de tu empresa",
                )
        
        # Calcular fechas límite
        if fecha_inicio and fecha_fin:
            # Usar fechas personalizadas
            fecha_limite_inicio = datetime.strptime(fecha_inicio, "%Y-%m-%d")
            fecha_limite_fin = datetime.strptime(fecha_fin, "%Y-%m-%d") + timedelta(days=1)  # Incluir todo el día final
            dias_periodo = (fecha_limite_fin - fecha_limite_inicio).days
        else:
            # Usar días hacia atrás
            fecha_limite_inicio = now_spain_naive() - timedelta(days=dias)
            fecha_limite_fin = now_spain_naive()
            dias_periodo = dias
        
        # Obtener búsquedas del usuario
        busquedas = db.query(Busqueda).filter(
            Busqueda.usuario_id == usuario_id,
            Busqueda.fecha_creacion >= fecha_limite_inicio,
            Busqueda.fecha_creacion <= fecha_limite_fin
        ).order_by(Busqueda.fecha_creacion.desc()).all()
        
        # Resumen por día
        busquedas_por_dia = {}
        for b in busquedas:
            dia = b.fecha_creacion.strftime("%Y-%m-%d")
            if dia not in busquedas_por_dia:
                busquedas_por_dia[dia] = {
                    "fecha": dia,
                    "total_busquedas": 0,
                    "referencias": [],
                    "plataformas": set()
                }
            busquedas_por_dia[dia]["total_busquedas"] += 1
            busquedas_por_dia[dia]["referencias"].append(b.referencia)
            busquedas_por_dia[dia]["plataformas"].add(b.plataforma)
        
        # Convertir sets a listas para JSON
        resumen_diario = []
        for dia, datos in sorted(busquedas_por_dia.items(), reverse=True):
            resumen_diario.append({
                "fecha": datos["fecha"],
                "total_busquedas": datos["total_busquedas"],
                "referencias_unicas": len(set(datos["referencias"])),
                "plataformas": list(datos["plataformas"])
            })
        
        # Últimas búsquedas detalladas (máximo 100)
        ultimas_busquedas = []
        for b in busquedas[:100]:
            ultimas_busquedas.append({
                "id": b.id,
                "referencia": b.referencia,
                "plataforma": b.plataforma,
                "cantidad_precios": b.cantidad_precios,
                "precio_medio": b.precio_medio,
                "precio_minimo": b.precio_minimo,
                "precio_maximo": b.precio_maximo,
                "fecha": b.fecha_creacion.isoformat()
            })
        
        # Estadísticas generales
        total_busquedas = len(busquedas)
        referencias_unicas = len(set(b.referencia for b in busquedas))
        plataformas_usadas = list(set(b.plataforma for b in busquedas if b.plataforma))
        
        # Calcular intervalo medio entre búsquedas (en minutos)
        intervalo_medio_minutos = None
        intervalo_medio_texto = None
        if len(busquedas) >= 2:
            # Ordenar por fecha ascendente para calcular intervalos
            busquedas_ordenadas = sorted(busquedas, key=lambda b: b.fecha_creacion)
            intervalos = []
            for i in range(1, len(busquedas_ordenadas)):
                diff = (busquedas_ordenadas[i].fecha_creacion - busquedas_ordenadas[i-1].fecha_creacion).total_seconds() / 60
                intervalos.append(diff)
            
            if intervalos:
                intervalo_medio_minutos = sum(intervalos) / len(intervalos)
                # Formatear el intervalo de forma legible
                if intervalo_medio_minutos < 60:
                    intervalo_medio_texto = f"{int(intervalo_medio_minutos)} min"
                elif intervalo_medio_minutos < 1440:  # Menos de un día
                    horas = intervalo_medio_minutos / 60
                    intervalo_medio_texto = f"{horas:.1f} horas"
                else:
                    dias_intervalo = intervalo_medio_minutos / 1440
                    intervalo_medio_texto = f"{dias_intervalo:.1f} días"
        
        return {
            "usuario": {
                "id": usuario.id,
                "email": usuario.email,
                "nombre": usuario.nombre,
                "rol": usuario.rol
            },
            "periodo_dias": dias_periodo,
            "fecha_inicio": fecha_limite_inicio.strftime("%Y-%m-%d"),
            "fecha_fin": fecha_limite_fin.strftime("%Y-%m-%d"),
            "estadisticas": {
                "total_busquedas": total_busquedas,
                "referencias_unicas": referencias_unicas,
                "plataformas_usadas": plataformas_usadas,
                "promedio_busquedas_dia": round(total_busquedas / dias_periodo, 2) if dias_periodo > 0 else 0,
                "intervalo_medio_minutos": round(intervalo_medio_minutos, 2) if intervalo_medio_minutos else None,
                "intervalo_medio_texto": intervalo_medio_texto
            },
            "resumen_diario": resumen_diario,
            "ultimas_busquedas": ultimas_busquedas
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo informe: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al obtener informe",
        )
