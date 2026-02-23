"""
Modelos de base de datos - Optimizados para BD eficiente
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Enum, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from app.database import Base
from utils.timezone import now_spain_naive
import enum


# ============== ENUMS ==============
class RoleEnum(str, enum.Enum):
    """Roles de usuarios"""
    SYSOWNER = "sysowner"  # Propietario de sistema - acceso total
    OWNER = "owner"        # Propietario de empresa - solo su empresa
    ADMIN = "admin"        # Administrador - gestiona usuarios
    USER = "user"          # Usuario normal


# ============== USUARIOS Y AUTENTICACIÓN ==============
class Usuario(Base):
    """Modelo para usuarios del sistema"""
    __tablename__ = "usuarios"
    __table_args__ = (
        Index('ix_usuario_email_entorno', 'email', 'entorno_trabajo_id', unique=True),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), index=True)  # Campo de usuario - único por entorno (no globalmente)
    nombre = Column(String(100))  # Nombre para mostrar (opcional)
    password_hash = Column(String(255))
    password_plain = Column(String(255), nullable=True)  # Para que admins puedan ver contraseñas de subordinados
    rol = Column(String(20), default="user")  # sysowner, owner, admin, user
    activo = Column(Boolean, default=True)
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id"), nullable=True)
    fecha_creacion = Column(DateTime, default=now_spain_naive)  # Hora de España
    fecha_ultimo_acceso = Column(DateTime, nullable=True)
    
    # Relaciones - especificar explícitamente
    entorno_trabajo = relationship("EntornoTrabajo", back_populates="usuarios", foreign_keys=[entorno_trabajo_id])
    busquedas = relationship("Busqueda", back_populates="usuario")


class EntornoTrabajo(Base):
    """Modelo para entornos de trabajo (aislamiento de datos)"""
    __tablename__ = "entornos_trabajo"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), unique=True, index=True)
    descripcion = Column(String(255), nullable=True)
    owner_id = Column(Integer, ForeignKey("usuarios.id"))
    activo = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime, default=now_spain_naive)  # Hora de España
    
    # ========== MÓDULOS ACTIVABLES/DESACTIVABLES ==========
    modulo_fichadas = Column(Boolean, default=True)  # Control de fichadas de piezas
    modulo_stock_masivo = Column(Boolean, default=True)  # Verificación masiva de stock
    modulo_referencias = Column(Boolean, default=True)  # Cruce de referencias OEM/IAM
    modulo_piezas_nuevas = Column(Boolean, default=True)  # Gestión de piezas nuevas desde CSV
    modulo_ventas = Column(Boolean, default=True)  # Historial de ventas
    modulo_precios_sugeridos = Column(Boolean, default=True)  # Cálculo de precios sugeridos
    modulo_importacion_csv = Column(Boolean, default=True)  # Importación automática de CSV
    modulo_inventario_piezas = Column(Boolean, default=True)  # Inventario de piezas (stock)
    modulo_estudio_coches = Column(Boolean, default=True)  # Estudio de coches
    modulo_paqueteria = Column(Boolean, default=True)  # Gestión de paquetería y envíos
    modulo_oem_equivalentes = Column(Boolean, default=True)  # OEM equivalentes (eBay)
    modulo_catalogo_vehiculos = Column(Boolean, default=True)  # Catálogo de vehículos
    
    # Relaciones
    usuarios = relationship("Usuario", back_populates="entorno_trabajo", foreign_keys="Usuario.entorno_trabajo_id")
    busquedas = relationship("Busqueda", back_populates="entorno_trabajo")


# ============== BÚSQUEDAS (OPTIMIZADO) ==============
class Busqueda(Base):
    """Modelo para registrar búsquedas - SOLO resumen, sin datos crudos"""
    __tablename__ = "busquedas"
    
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id"))
    
    referencia = Column(String(100), index=True)
    plataforma = Column(String(50))
    
    # Solo guardar el resumen, no los precios individuales
    cantidad_precios = Column(Integer)
    precio_medio = Column(Float)
    precio_mediana = Column(Float)
    precio_minimo = Column(Float)
    precio_maximo = Column(Float)
    desviacion_estandar = Column(Float, default=0)
    outliers_removidos = Column(Integer, default=0)
    
    fecha_creacion = Column(DateTime, default=now_spain_naive)  # Hora de España
    
    # Relaciones
    usuario = relationship("Usuario", back_populates="busquedas")
    entorno_trabajo = relationship("EntornoTrabajo", back_populates="busquedas")


# ============== STOCK (OPTIMIZADO) ==============
class ResultadoStock(Base):
    """Modelo para checkeo de stock - SOLO resumen"""
    __tablename__ = "resultados_stock"
    
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id"))
    
    ref_id = Column(String(100), index=True)
    ref_oem = Column(String(100))
    
    precio_azeler = Column(Float)
    precio_mercado = Column(Float)
    diferencia_porcentaje = Column(Float)
    es_outlier = Column(Boolean)
    precios_encontrados = Column(Integer)
    
    fecha_creacion = Column(DateTime, default=now_spain_naive)  # Hora de España


# ============== TOKENS ==============
class TokenToen(Base):
    """Modelo para guardar token TOEN de Ecooparts"""
    __tablename__ = "tokens"
    
    id = Column(Integer, primary_key=True, index=True)
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id"))
    plataforma = Column(String(50), index=True)
    token = Column(String(500))
    
    fecha_creacion = Column(DateTime, default=now_spain_naive)  # Hora de España
    fecha_actualizacion = Column(DateTime, onupdate=now_spain_naive)  # Hora de España
    
    # Índice único por entorno + plataforma
    __table_args__ = (
        # Un token por plataforma por entorno
    )

# ============== BASE DE DATOS DESGUACE ==============
class BaseDesguace(Base):
    """Modelo para almacenar la base de datos de piezas del desguace por entorno"""
    __tablename__ = "bases_desguace"
    
    id = Column(Integer, primary_key=True, index=True)
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id"), unique=True)  # Solo una BD por entorno
    
    nombre_archivo = Column(String(255))  # Nombre original del CSV
    total_piezas = Column(Integer, default=0)  # Cantidad de piezas en el CSV
    columnas = Column(String(1000), nullable=True)  # Columnas del CSV separadas por coma
    mapeo_columnas = Column(String(2000), nullable=True)  # JSON con el mapeo de columnas
    
    subido_por_id = Column(Integer, ForeignKey("usuarios.id"))  # Quién subió el archivo
    
    fecha_subida = Column(DateTime, default=now_spain_naive)  # Hora de España
    fecha_actualizacion = Column(DateTime, onupdate=now_spain_naive)  # Hora de España
    
    # Relaciones
    entorno_trabajo = relationship("EntornoTrabajo")
    subido_por = relationship("Usuario")
    piezas = relationship("PiezaDesguace", back_populates="base_desguace", cascade="all, delete-orphan")


class PiezaDesguace(Base):
    """Modelo para almacenar las piezas del CSV del desguace"""
    __tablename__ = "piezas_desguace"
    
    id = Column(Integer, primary_key=True, index=True)
    base_desguace_id = Column(Integer, ForeignKey("bases_desguace.id", ondelete="CASCADE"))
    
    # Campos específicos del desguace
    refid = Column(String(100), index=True, nullable=True)  # Referencia interna
    oem = Column(String(100), nullable=True, index=True)  # Referencia OEM
    oe = Column(String(100), nullable=True)  # Referencia OE
    iam = Column(String(100), nullable=True)  # Referencia IAM
    precio = Column(Float, nullable=True)  # Precio de venta
    ubicacion = Column(String(100), nullable=True)  # Ubicación en almacén
    observaciones = Column(String(500), nullable=True)  # Observaciones
    articulo = Column(String(255), nullable=True)  # Nombre del artículo
    marca = Column(String(100), nullable=True, index=True)  # Marca del vehículo
    modelo = Column(String(100), nullable=True, index=True)  # Modelo del vehículo
    version = Column(String(100), nullable=True)  # Versión del vehículo
    imagen = Column(String(500), nullable=True)  # URL de la imagen
    
    # Campos de fichaje
    fecha_fichaje = Column(DateTime, nullable=True)  # Fecha cuando alguien fichó la pieza
    usuario_fichaje_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)  # Usuario que fichó
    
    fecha_creacion = Column(DateTime, default=now_spain_naive)  # Hora de España
    
    # Relaciones
    base_desguace = relationship("BaseDesguace", back_populates="piezas")
    usuario_fichaje = relationship("Usuario", foreign_keys=[usuario_fichaje_id])


class PiezaVendida(Base):
    """Modelo para almacenar el historial de piezas vendidas (detectadas al actualizar la base)"""
    __tablename__ = "piezas_vendidas"
    
    id = Column(Integer, primary_key=True, index=True)
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id", ondelete="CASCADE"), index=True)
    
    # Campos de la pieza (copia de cuando se vendió)
    refid = Column(String(100), index=True, nullable=True)
    oem = Column(String(100), nullable=True, index=True)
    oe = Column(String(100), nullable=True)
    iam = Column(String(100), nullable=True)
    precio = Column(Float, nullable=True)
    ubicacion = Column(String(100), nullable=True)
    observaciones = Column(String(500), nullable=True)
    articulo = Column(String(255), nullable=True)
    marca = Column(String(100), nullable=True, index=True)
    modelo = Column(String(100), nullable=True, index=True)
    version = Column(String(100), nullable=True)
    imagen = Column(String(500), nullable=True)
    
    # Información de fichaje (copiada de cuando se vendió)
    fecha_fichaje = Column(DateTime, nullable=True)  # Fecha cuando se fichó la pieza
    usuario_fichaje_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)  # Usuario que fichó
    
    # Información de la venta
    fecha_venta = Column(DateTime, default=now_spain_naive)  # Hora de España - Fecha en que se detectó la venta
    archivo_origen = Column(String(255), nullable=True)  # CSV de donde venía originalmente
    
    # Relaciones
    entorno_trabajo = relationship("EntornoTrabajo")
    usuario_fichaje = relationship("Usuario", foreign_keys=[usuario_fichaje_id])


# ============== CONFIGURACIÓN DE PRECIOS POR DESGUACE ==============
class ConfiguracionPrecios(Base):
    """Modelo para almacenar la configuración de archivos de precios por entorno/desguace"""
    __tablename__ = "configuracion_precios"
    
    id = Column(Integer, primary_key=True, index=True)
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id"), unique=True)  # Solo una config por entorno
    
    # Info del archivo pieza_familia
    pieza_familia_archivo = Column(String(255), nullable=True)  # Nombre del archivo subido
    pieza_familia_registros = Column(Integer, default=0)  # Cantidad de registros
    
    # Info del archivo familia_precios
    familia_precios_archivo = Column(String(255), nullable=True)  # Nombre del archivo subido
    familia_precios_registros = Column(Integer, default=0)  # Cantidad de registros
    
    subido_por_id = Column(Integer, ForeignKey("usuarios.id"))
    fecha_subida = Column(DateTime, default=now_spain_naive)  # Hora de España
    fecha_actualizacion = Column(DateTime, onupdate=now_spain_naive)  # Hora de España
    
    # Relaciones
    entorno_trabajo = relationship("EntornoTrabajo")
    subido_por = relationship("Usuario")
    piezas_familia = relationship("PiezaFamiliaDesguace", back_populates="configuracion", cascade="all, delete-orphan")
    familias_precios = relationship("FamiliaPreciosDesguace", back_populates="configuracion", cascade="all, delete-orphan")


class PiezaFamiliaDesguace(Base):
    """Mapeo de pieza -> familia por desguace"""
    __tablename__ = "piezas_familia_desguace"
    
    id = Column(Integer, primary_key=True, index=True)
    configuracion_id = Column(Integer, ForeignKey("configuracion_precios.id", ondelete="CASCADE"))
    
    pieza = Column(String(255), index=True)  # Nombre de la pieza (ej: "ALTERNADOR")
    familia = Column(String(255), index=True)  # Familia a la que pertenece (ej: "ALTERNADORES")
    
    configuracion = relationship("ConfiguracionPrecios", back_populates="piezas_familia")


class FamiliaPreciosDesguace(Base):
    """Precios por familia por desguace"""
    __tablename__ = "familias_precios_desguace"
    
    id = Column(Integer, primary_key=True, index=True)
    configuracion_id = Column(Integer, ForeignKey("configuracion_precios.id", ondelete="CASCADE"))
    
    familia = Column(String(255), index=True)  # Nombre de la familia
    precios = Column(String(1000))  # Precios separados por coma (ej: "18,28,48,88,148")
    
    configuracion = relationship("ConfiguracionPrecios", back_populates="familias_precios")


# ============== FICHADAS DE PIEZAS ==============
class FichadaPieza(Base):
    """Modelo para registrar fichadas de piezas por usuario"""
    __tablename__ = "fichadas_piezas"
    
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"))
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id", ondelete="CASCADE"))
    
    id_pieza = Column(String(100), index=True)  # ID de la pieza fichada
    descripcion = Column(String(500), nullable=True)  # Descripción opcional
    comentario = Column(String(500), nullable=True)  # Comentario adicional sobre la pieza
    
    fecha_fichada = Column(DateTime, default=now_spain_naive)  # Hora de España
    
    # Relaciones
    usuario = relationship("Usuario")
    entorno_trabajo = relationship("EntornoTrabajo")
    verificaciones = relationship("VerificacionFichada", back_populates="fichada", cascade="all, delete-orphan")


class VerificacionFichada(Base):
    """Modelo para almacenar verificaciones de fichadas contra la base de datos"""
    __tablename__ = "verificaciones_fichadas"
    
    id = Column(Integer, primary_key=True, index=True)
    fichada_id = Column(Integer, ForeignKey("fichadas_piezas.id", ondelete="CASCADE"))
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"))
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id", ondelete="CASCADE"))
    
    # Datos de la pieza (copiados para historial)
    id_pieza = Column(String(100), index=True)
    hora_fichada = Column(DateTime)  # Hora original de la fichada (España)
    
    # Resultado de verificación
    en_stock = Column(Boolean, default=False)  # True si se encontró en la base
    fecha_verificacion = Column(DateTime, default=now_spain_naive)  # Hora de España
    
    # Relaciones
    fichada = relationship("FichadaPieza", back_populates="verificaciones")
    usuario = relationship("Usuario")
    entorno_trabajo = relationship("EntornoTrabajo")


# ============== LOGS DE AUDITORÍA ==============
class AuditLog(Base):
    """Modelo para registrar acciones de auditoría"""
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id", ondelete="SET NULL"), nullable=True)
    
    # Detalles de la acción
    accion = Column(String(50), index=True)  # LOGIN, LOGOUT, CREATE, UPDATE, DELETE, SEARCH, BACKUP, etc.
    entidad = Column(String(50), index=True)  # fichada, usuario, busqueda, etc.
    entidad_id = Column(Integer, nullable=True)  # ID del objeto afectado
    descripcion = Column(String(500))  # Descripción legible
    datos_adicionales = Column(String(2000), nullable=True)  # JSON con detalles extra
    
    # Metadata
    ip_address = Column(String(45), nullable=True)  # IPv4 o IPv6
    user_agent = Column(String(255), nullable=True)
    fecha = Column(DateTime, default=now_spain_naive, index=True)
    
    # Relaciones
    usuario = relationship("Usuario")
    entorno_trabajo = relationship("EntornoTrabajo")


# ============== BACKUPS ==============
class BackupRecord(Base):
    """Modelo para registrar backups realizados"""
    __tablename__ = "backup_records"
    
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    
    filename = Column(String(255))  # Nombre del archivo de backup
    filepath = Column(String(500))  # Ruta completa
    size_bytes = Column(Integer)  # Tamaño en bytes
    tipo = Column(String(20))  # manual, automatico, programado
    
    fecha_creacion = Column(DateTime, default=now_spain_naive)
    fecha_expiracion = Column(DateTime, nullable=True)  # Para limpieza automática
    
    # Estado
    exitoso = Column(Boolean, default=True)
    mensaje = Column(String(500), nullable=True)  # Error si falla
    
    # Relaciones
    usuario = relationship("Usuario")


# ============== CSV GUARDADOS ==============
class CSVGuardado(Base):
    """Modelo para guardar CSVs subidos para verificación de stock"""
    __tablename__ = "csv_guardados"
    
    id = Column(Integer, primary_key=True, index=True)
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id"))
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))
    nombre = Column(String(255))  # Nombre original del archivo
    ruta_archivo = Column(String(500))  # Ruta en disco
    total_piezas = Column(Integer, default=0)
    fecha_subida = Column(DateTime, default=now_spain_naive)
    
    # Relaciones
    entorno_trabajo = relationship("EntornoTrabajo")
    usuario = relationship("Usuario")


# ============== PIEZAS PEDIDAS (CONTROL DE STOCK) ==============
class PiezaPedida(Base):
    """Modelo para registrar piezas que ya han sido pedidas/compradas"""
    __tablename__ = "piezas_pedidas"
    
    id = Column(Integer, primary_key=True, index=True)
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id"))
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))  # Quién la marcó como pedida
    
    referencia = Column(String(100), index=True)  # OEM/Referencia de la pieza
    cantidad = Column(Integer, default=1)  # Cantidad pedida
    observaciones = Column(String(500), nullable=True)  # Notas opcionales
    
    fecha_pedido = Column(DateTime, default=now_spain_naive)
    recibida = Column(Boolean, default=False)  # Si ya llegó y está en inventario
    fecha_recepcion = Column(DateTime, nullable=True)
    
    # Relaciones
    entorno_trabajo = relationship("EntornoTrabajo")
    usuario = relationship("Usuario")


# ============== CONFIGURACIÓN DE STOCKEO AUTOMÁTICO ==============
class ConfiguracionStockeo(Base):
    """Configuración de importación automática de CSV por empresa"""
    __tablename__ = "configuraciones_stockeo"
    
    id = Column(Integer, primary_key=True, index=True)
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id"), unique=True)
    
    # Configuración del archivo
    ruta_csv = Column(String(500), nullable=True)  # Ruta al archivo CSV
    encoding = Column(String(50), default='utf-8-sig')  # Encoding del archivo
    delimitador = Column(String(5), default=';')  # Delimitador CSV
    
    # Mapeo de columnas (JSON como string)
    # Formato: {"refid": "ref.id", "oem": "oem", "precio": "precio", ...}
    mapeo_columnas = Column(String(2000), nullable=True)
    
    # Configuración de tiempo
    intervalo_minutos = Column(Integer, default=30)  # Cada cuántos minutos ejecutar
    activo = Column(Boolean, default=False)  # Si está activo o no
    
    # Metadatos
    ultima_ejecucion = Column(DateTime, nullable=True)
    ultimo_resultado = Column(String(500), nullable=True)  # Resumen última ejecución
    piezas_importadas = Column(Integer, default=0)
    ventas_detectadas = Column(Integer, default=0)
    
    fecha_creacion = Column(DateTime, default=now_spain_naive)
    fecha_actualizacion = Column(DateTime, default=now_spain_naive, onupdate=now_spain_naive)
    
    # Relaciones
    entorno_trabajo = relationship("EntornoTrabajo")


# ============== TICKETS DE SOPORTE ==============
class TipoTicket(str, enum.Enum):
    """Tipos de tickets"""
    REPORTE = "reporte"        # Reportar un problema/bug
    SUGERENCIA = "sugerencia"  # Sugerir una mejora
    DUDA = "duda"              # Preguntar una duda
    OTRO = "otro"              # Otro tipo


class EstadoTicket(str, enum.Enum):
    """Estados de tickets"""
    ABIERTO = "abierto"
    EN_PROCESO = "en_proceso"
    RESUELTO = "resuelto"
    CERRADO = "cerrado"


class Ticket(Base):
    """Modelo para tickets de soporte"""
    __tablename__ = "tickets"
    
    id = Column(Integer, primary_key=True, index=True)
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id"))
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))  # Quién creó el ticket
    
    tipo = Column(String(20), default="otro")  # reporte, sugerencia, duda, otro
    asunto = Column(String(200))
    descripcion = Column(String(2000))
    estado = Column(String(20), default="abierto")  # abierto, en_proceso, resuelto, cerrado
    prioridad = Column(String(20), default="normal")  # baja, normal, alta, urgente
    
    fecha_creacion = Column(DateTime, default=now_spain_naive)
    fecha_actualizacion = Column(DateTime, default=now_spain_naive, onupdate=now_spain_naive)
    
    # Relaciones
    entorno_trabajo = relationship("EntornoTrabajo")
    usuario = relationship("Usuario", foreign_keys=[usuario_id])
    mensajes = relationship("TicketMensaje", back_populates="ticket", order_by="TicketMensaje.fecha_creacion")


class TicketMensaje(Base):
    """Modelo para mensajes de tickets (chat)"""
    __tablename__ = "ticket_mensajes"
    
    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"))
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))  # Quién escribió el mensaje
    
    mensaje = Column(String(2000))
    es_soporte = Column(Boolean, default=False)  # True si es respuesta del soporte
    
    fecha_creacion = Column(DateTime, default=now_spain_naive)
    
    # Relaciones
    ticket = relationship("Ticket", back_populates="mensajes")
    usuario = relationship("Usuario")


# ============== LOGS DE PETICIONES API ==============
class APIRequestLog(Base):
    """Modelo para registrar todas las peticiones a la API"""
    __tablename__ = "api_request_logs"
    __table_args__ = (
        Index('ix_api_logs_fecha', 'fecha'),
        Index('ix_api_logs_entorno', 'entorno_trabajo_id'),
        Index('ix_api_logs_usuario', 'usuario_id'),
        Index('ix_api_logs_ruta', 'ruta'),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Detalles de la petición
    metodo = Column(String(10))  # GET, POST, PUT, DELETE, etc.
    ruta = Column(String(255))  # /api/v1/precios/buscar
    query_params = Column(String(500), nullable=True)  # Parámetros de query
    status_code = Column(Integer)  # 200, 401, 500, etc.
    duracion_ms = Column(Float)  # Tiempo de respuesta en ms
    
    # Usuario que hizo la petición
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    usuario_email = Column(String(100), nullable=True)
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id", ondelete="SET NULL"), nullable=True)
    entorno_nombre = Column(String(100), nullable=True)
    rol = Column(String(20), nullable=True)
    
    # Metadata
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    fecha = Column(DateTime, default=now_spain_naive, index=True)
    
    # Relaciones
    usuario = relationship("Usuario")
    entorno_trabajo = relationship("EntornoTrabajo")


# ============== ANUNCIOS / CHANGELOG ==============
class Anuncio(Base):
    """Modelo para anuncios y changelog del sistema"""
    __tablename__ = "anuncios"
    
    id = Column(Integer, primary_key=True, index=True)
    
    titulo = Column(String(255), nullable=False)
    contenido = Column(String(5000), nullable=False)  # Contenido en markdown
    version = Column(String(50), nullable=True)  # Versión del software (ej: "1.7.0")
    tipo = Column(String(50), default="changelog")  # changelog, anuncio, mantenimiento
    
    activo = Column(Boolean, default=True)  # Si está activo se muestra
    mostrar_popup = Column(Boolean, default=True)  # Si debe aparecer como popup al iniciar sesión
    
    creado_por_id = Column(Integer, ForeignKey("usuarios.id"))
    fecha_creacion = Column(DateTime, default=now_spain_naive)
    fecha_actualizacion = Column(DateTime, onupdate=now_spain_naive)
    
    # Relaciones
    creado_por = relationship("Usuario")
    lecturas = relationship("AnuncioLeido", back_populates="anuncio", cascade="all, delete-orphan")


class AnuncioLeido(Base):
    """Registro de anuncios leídos por usuario"""
    __tablename__ = "anuncios_leidos"
    __table_args__ = (
        Index('ix_anuncio_leido_usuario_anuncio', 'usuario_id', 'anuncio_id', unique=True),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"))
    anuncio_id = Column(Integer, ForeignKey("anuncios.id", ondelete="CASCADE"))
    fecha_lectura = Column(DateTime, default=now_spain_naive)
    
    # Relaciones
    usuario = relationship("Usuario")
    anuncio = relationship("Anuncio", back_populates="lecturas")


# ============== PAQUETERÍA ==============

class SucursalPaqueteria(Base):
    """Sucursal/puesto de paquetería dentro de un entorno de trabajo"""
    __tablename__ = "sucursales_paqueteria"
    __table_args__ = (
        Index('ix_sucpaq_entorno', 'entorno_trabajo_id'),
    )

    id = Column(Integer, primary_key=True, index=True)
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id", ondelete="CASCADE"))
    nombre = Column(String(100), nullable=False)
    color_hex = Column(String(7), default="#3B82F6")  # Color para identificar visualmente
    es_legacy = Column(Boolean, default=False)  # True = sucursal de migración (oculta al selector)
    activa = Column(Boolean, default=True)
    fecha_creacion = Column(DateTime, default=now_spain_naive)

    # Relaciones
    entorno_trabajo = relationship("EntornoTrabajo")
    registros = relationship("RegistroPaquete", back_populates="sucursal")
    stock_cajas = relationship("StockCajaSucursal", back_populates="sucursal", cascade="all, delete-orphan")


class RegistroPaquete(Base):
    """Registro de empaquetado: cada fila = 1 material/caja asociado a 1 pieza"""
    __tablename__ = "registros_paquetes"
    __table_args__ = (
        Index('ix_regpaq_entorno_fecha', 'entorno_trabajo_id', 'fecha_registro'),
        Index('ix_regpaq_usuario_fecha', 'usuario_id', 'fecha_registro'),
        Index('ix_regpaq_id_caja', 'id_caja'),
        Index('ix_regpaq_grupo', 'grupo_paquete'),
    )

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"))
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id", ondelete="CASCADE"))
    sucursal_paqueteria_id = Column(Integer, ForeignKey("sucursales_paqueteria.id", ondelete="SET NULL"), nullable=True)

    id_caja = Column(String(100), index=True)   # ID escaneado de la caja/material
    id_pieza = Column(String(100), index=True)   # ID escaneado de la pieza
    grupo_paquete = Column(String(36), nullable=True, index=True)  # UUID para agrupar cajas de la misma pieza

    fecha_registro = Column(DateTime, default=now_spain_naive)

    # Relaciones
    usuario = relationship("Usuario")
    entorno_trabajo = relationship("EntornoTrabajo")
    sucursal = relationship("SucursalPaqueteria", back_populates="registros")


# ============== TIPOS DE CAJA ==============
class TipoCaja(Base):
    """Tabla para asociar referencias de caja a un tipo/categoría"""
    __tablename__ = "tipos_caja"
    __table_args__ = (
        Index('ix_tipocaja_entorno', 'entorno_trabajo_id'),
        Index('ix_tipocaja_ref_entorno', 'referencia_caja', 'entorno_trabajo_id', unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id", ondelete="CASCADE"))
    referencia_caja = Column(String(100), nullable=False)   # La referencia/ID de la caja
    tipo_nombre = Column(String(150), nullable=False)        # Nombre del tipo (ej: "Caja Grande", "Palet")
    descripcion = Column(String(500), nullable=True)         # Descripción opcional
    stock_actual = Column(Integer, default=0)                # Cajas disponibles ahora
    dias_aviso = Column(Integer, nullable=True)              # Días restantes para avisar (null = sin aviso)
    aviso_enviado = Column(Boolean, default=False)           # True si ya se envió aviso (se resetea con nueva entrada)
    fecha_creacion = Column(DateTime, default=now_spain_naive)

    # Relaciones
    entorno_trabajo = relationship("EntornoTrabajo")
    movimientos = relationship("MovimientoCaja", back_populates="tipo_caja", cascade="all, delete-orphan")


class MovimientoCaja(Base):
    """Registro de cada movimiento de stock de cajas (entrada, consumo, ajuste)"""
    __tablename__ = "movimientos_caja"
    __table_args__ = (
        Index('ix_movcaja_tipo_fecha', 'tipo_caja_id', 'fecha'),
        Index('ix_movcaja_entorno_fecha', 'entorno_trabajo_id', 'fecha'),
    )

    id = Column(Integer, primary_key=True, index=True)
    tipo_caja_id = Column(Integer, ForeignKey("tipos_caja.id", ondelete="CASCADE"))
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id", ondelete="CASCADE"))
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    sucursal_paqueteria_id = Column(Integer, ForeignKey("sucursales_paqueteria.id", ondelete="SET NULL"), nullable=True)

    cantidad = Column(Integer, nullable=False)      # Positivo = entrada, negativo = consumo
    tipo_movimiento = Column(String(20), nullable=False)  # 'entrada', 'consumo', 'ajuste'
    notas = Column(String(500), nullable=True)
    fecha = Column(DateTime, default=now_spain_naive)

    # Relaciones
    tipo_caja = relationship("TipoCaja", back_populates="movimientos")
    entorno_trabajo = relationship("EntornoTrabajo")
    usuario = relationship("Usuario")
    sucursal = relationship("SucursalPaqueteria")


class StockCajaSucursal(Base):
    """Stock de un tipo de caja por sucursal"""
    __tablename__ = "stock_caja_sucursal"
    __table_args__ = (
        Index('ix_stockcajasuc_tipo_suc', 'tipo_caja_id', 'sucursal_paqueteria_id', unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    tipo_caja_id = Column(Integer, ForeignKey("tipos_caja.id", ondelete="CASCADE"))
    sucursal_paqueteria_id = Column(Integer, ForeignKey("sucursales_paqueteria.id", ondelete="CASCADE"))
    stock_actual = Column(Integer, default=0)

    # Relaciones
    tipo_caja = relationship("TipoCaja")
    sucursal = relationship("SucursalPaqueteria", back_populates="stock_cajas")


# ============== CLIENTES INTERESADOS (Ventas) ==============
class ClienteInteresado(Base):
    """Cliente interesado en comprar una pieza"""
    __tablename__ = "clientes_interesados"
    __table_args__ = (
        Index('ix_clienteint_entorno', 'entorno_trabajo_id'),
        Index('ix_clienteint_estado', 'estado'),
    )

    id = Column(Integer, primary_key=True, index=True)
    entorno_trabajo_id = Column(Integer, ForeignKey("entornos_trabajo.id", ondelete="CASCADE"))
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)

    nombre = Column(String(200), nullable=False)
    email = Column(String(200), nullable=True)
    telefono = Column(String(50), nullable=True)

    pieza_buscada = Column(String(300), nullable=True)
    marca_coche = Column(String(100), nullable=True)
    modelo_coche = Column(String(100), nullable=True)
    anio_coche = Column(String(10), nullable=True)
    version_coche = Column(String(150), nullable=True)
    observaciones = Column(String(1000), nullable=True)

    estado = Column(String(20), default="pendiente")  # pendiente, contactado, vendido, descartado
    fecha_registro = Column(DateTime, default=now_spain_naive)

    # Relaciones
    entorno_trabajo = relationship("EntornoTrabajo")
    usuario = relationship("Usuario")


# ============== VEHÍCULOS DE REFERENCIA ==============
class VehiculoReferencia(Base):
    """Catálogo de vehículos con datos de precios por estado"""
    __tablename__ = "vehiculos_referencia"
    __table_args__ = (
        Index('ix_vehiculoref_marca', 'marca'),
        Index('ix_vehiculoref_marca_modelo', 'marca', 'modelo'),
    )

    id = Column(Integer, primary_key=True, index=True)
    marca = Column(String(100), nullable=False)
    modelo = Column(String(150), nullable=False)
    anios_produccion = Column(String(50), nullable=True)
    rango_anios = Column(String(20), nullable=True)
    tiene_serie = Column(Boolean, default=False)
    tiene_deportiva = Column(Boolean, default=False)
    observaciones_facelift = Column(String(500), nullable=True)
    serie_1g = Column(String(50), nullable=True)
    serie_2g = Column(String(50), nullable=True)
    serie_3g = Column(String(50), nullable=True)
    precio_fatal_10 = Column(Float, nullable=True)
    precio_mal_13 = Column(Float, nullable=True)
    precio_regular_17 = Column(Float, nullable=True)
    precio_bien_23 = Column(Float, nullable=True)
    precio_vida_deportiva = Column(Float, nullable=True)
    valor_minimo_usado = Column(Float, nullable=True)
    porcentaje_15 = Column(Float, nullable=True)
    porcentaje_20 = Column(Float, nullable=True)
    porcentaje_23 = Column(Float, nullable=True)
    compatibilidad = Column(String(500), nullable=True)