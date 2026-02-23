"""
Migración completa para VPS - Febrero 2026
Crea tablas nuevas y añade columnas faltantes a tablas existentes.
Seguro para ejecutar múltiples veces (idempotente).
"""
import sqlite3
import sys
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "desguapro.db")


def get_table_names(cursor):
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    return {row[0] for row in cursor.fetchall()}


def get_columns(cursor, table):
    cursor.execute(f"PRAGMA table_info({table})")
    return {col[1] for col in cursor.fetchall()}


def get_indexes(cursor):
    cursor.execute("SELECT name FROM sqlite_master WHERE type='index'")
    return {row[0] for row in cursor.fetchall()}


def add_column_if_missing(cursor, table, column, definition, tables):
    if table not in tables:
        return  # La tabla no existe, se creará entera
    cols = get_columns(cursor, table)
    if column not in cols:
        print(f"  ➕ ALTER TABLE {table} ADD COLUMN {column} {definition}")
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    else:
        print(f"  ✅ {table}.{column} ya existe")


def create_index_if_missing(cursor, name, definition, indexes):
    if name not in indexes:
        print(f"  ➕ CREATE INDEX {name}")
        cursor.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {definition}")
    else:
        print(f"  ✅ Índice {name} ya existe")


def migrar():
    if not os.path.exists(DB_PATH):
        print(f"❌ No se encontró la BD en {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    tables = get_table_names(cursor)
    indexes = get_indexes(cursor)

    print("=" * 60)
    print("MIGRACIÓN COMPLETA - DesguaPro VPS")
    print("=" * 60)
    print(f"BD: {DB_PATH}")
    print(f"Tablas existentes: {len(tables)}")
    print()

    # ─── 1. COLUMNAS NUEVAS EN TABLAS EXISTENTES ───

    print("── 1. Columnas nuevas en tablas existentes ──")

    # usuarios: nombre, password_plain
    add_column_if_missing(cursor, "usuarios", "nombre", "VARCHAR(100)", tables)
    add_column_if_missing(cursor, "usuarios", "password_plain", "VARCHAR(255)", tables)

    # entornos_trabajo: módulos nuevos
    add_column_if_missing(cursor, "entornos_trabajo", "modulo_paqueteria", "BOOLEAN DEFAULT 1", tables)
    add_column_if_missing(cursor, "entornos_trabajo", "modulo_oem_equivalentes", "BOOLEAN DEFAULT 1", tables)
    add_column_if_missing(cursor, "entornos_trabajo", "modulo_catalogo_vehiculos", "BOOLEAN DEFAULT 1", tables)

    # registros_paquetes: sucursal_paqueteria_id, grupo_paquete
    add_column_if_missing(cursor, "registros_paquetes", "sucursal_paqueteria_id", "INTEGER REFERENCES sucursales_paqueteria(id) ON DELETE SET NULL", tables)
    add_column_if_missing(cursor, "registros_paquetes", "grupo_paquete", "VARCHAR(36)", tables)

    print()

    # ─── 2. TABLAS NUEVAS ───

    print("── 2. Tablas nuevas ──")

    # -- Sucursales Paquetería --
    if "sucursales_paqueteria" not in tables:
        print("  ➕ CREATE TABLE sucursales_paqueteria")
        cursor.execute("""
            CREATE TABLE sucursales_paqueteria (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entorno_trabajo_id INTEGER NOT NULL REFERENCES entornos_trabajo(id) ON DELETE CASCADE,
                nombre VARCHAR(100) NOT NULL,
                color_hex VARCHAR(7) DEFAULT '#3B82F6',
                es_legacy BOOLEAN DEFAULT 0,
                activa BOOLEAN DEFAULT 1,
                fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
    else:
        print("  ✅ sucursales_paqueteria ya existe")
        # Verificar columnas nuevas en sucursales_paqueteria
        add_column_if_missing(cursor, "sucursales_paqueteria", "es_legacy", "BOOLEAN DEFAULT 0", get_table_names(cursor))

    # -- Registros Paquetes --
    if "registros_paquetes" not in tables:
        print("  ➕ CREATE TABLE registros_paquetes")
        cursor.execute("""
            CREATE TABLE registros_paquetes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                entorno_trabajo_id INTEGER NOT NULL REFERENCES entornos_trabajo(id) ON DELETE CASCADE,
                sucursal_paqueteria_id INTEGER REFERENCES sucursales_paqueteria(id) ON DELETE SET NULL,
                id_caja VARCHAR(100),
                id_pieza VARCHAR(100),
                grupo_paquete VARCHAR(36),
                fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
    else:
        print("  ✅ registros_paquetes ya existe")

    # -- Tipos de Caja --
    if "tipos_caja" not in tables:
        print("  ➕ CREATE TABLE tipos_caja")
        cursor.execute("""
            CREATE TABLE tipos_caja (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entorno_trabajo_id INTEGER NOT NULL REFERENCES entornos_trabajo(id) ON DELETE CASCADE,
                referencia_caja VARCHAR(100) NOT NULL,
                tipo_nombre VARCHAR(150) NOT NULL,
                descripcion VARCHAR(500),
                stock_actual INTEGER DEFAULT 0,
                dias_aviso INTEGER,
                aviso_enviado BOOLEAN DEFAULT 0,
                fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
    else:
        print("  ✅ tipos_caja ya existe")
        add_column_if_missing(cursor, "tipos_caja", "dias_aviso", "INTEGER", get_table_names(cursor))
        add_column_if_missing(cursor, "tipos_caja", "aviso_enviado", "BOOLEAN DEFAULT 0", get_table_names(cursor))

    # -- Movimientos de Caja --
    if "movimientos_caja" not in tables:
        print("  ➕ CREATE TABLE movimientos_caja")
        cursor.execute("""
            CREATE TABLE movimientos_caja (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo_caja_id INTEGER NOT NULL REFERENCES tipos_caja(id) ON DELETE CASCADE,
                entorno_trabajo_id INTEGER NOT NULL REFERENCES entornos_trabajo(id) ON DELETE CASCADE,
                usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                sucursal_paqueteria_id INTEGER REFERENCES sucursales_paqueteria(id) ON DELETE SET NULL,
                cantidad INTEGER NOT NULL,
                tipo_movimiento VARCHAR(20) NOT NULL,
                notas VARCHAR(500),
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
    else:
        print("  ✅ movimientos_caja ya existe")

    # -- Stock Caja Sucursal --
    if "stock_caja_sucursal" not in tables:
        print("  ➕ CREATE TABLE stock_caja_sucursal")
        cursor.execute("""
            CREATE TABLE stock_caja_sucursal (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo_caja_id INTEGER NOT NULL REFERENCES tipos_caja(id) ON DELETE CASCADE,
                sucursal_paqueteria_id INTEGER NOT NULL REFERENCES sucursales_paqueteria(id) ON DELETE CASCADE,
                stock_actual INTEGER DEFAULT 0
            )
        """)
    else:
        print("  ✅ stock_caja_sucursal ya existe")

    # -- Tickets --
    if "tickets" not in tables:
        print("  ➕ CREATE TABLE tickets")
        cursor.execute("""
            CREATE TABLE tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entorno_trabajo_id INTEGER REFERENCES entornos_trabajo(id),
                usuario_id INTEGER REFERENCES usuarios(id),
                tipo VARCHAR(20) DEFAULT 'otro',
                asunto VARCHAR(200),
                descripcion VARCHAR(2000),
                estado VARCHAR(20) DEFAULT 'abierto',
                prioridad VARCHAR(20) DEFAULT 'normal',
                fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
                fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
    else:
        print("  ✅ tickets ya existe")

    if "ticket_mensajes" not in tables:
        print("  ➕ CREATE TABLE ticket_mensajes")
        cursor.execute("""
            CREATE TABLE ticket_mensajes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id INTEGER REFERENCES tickets(id),
                usuario_id INTEGER REFERENCES usuarios(id),
                mensaje VARCHAR(2000),
                es_soporte BOOLEAN DEFAULT 0,
                fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
    else:
        print("  ✅ ticket_mensajes ya existe")

    # -- API Request Logs --
    if "api_request_logs" not in tables:
        print("  ➕ CREATE TABLE api_request_logs")
        cursor.execute("""
            CREATE TABLE api_request_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metodo VARCHAR(10),
                ruta VARCHAR(255),
                query_params VARCHAR(500),
                status_code INTEGER,
                duracion_ms FLOAT,
                usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                usuario_email VARCHAR(100),
                entorno_trabajo_id INTEGER REFERENCES entornos_trabajo(id) ON DELETE SET NULL,
                entorno_nombre VARCHAR(100),
                rol VARCHAR(20),
                ip_address VARCHAR(45),
                user_agent VARCHAR(255),
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
    else:
        print("  ✅ api_request_logs ya existe")

    # -- Anuncios --
    if "anuncios" not in tables:
        print("  ➕ CREATE TABLE anuncios")
        cursor.execute("""
            CREATE TABLE anuncios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo VARCHAR(255) NOT NULL,
                contenido VARCHAR(5000) NOT NULL,
                version VARCHAR(50),
                tipo VARCHAR(50) DEFAULT 'changelog',
                activo BOOLEAN DEFAULT 1,
                mostrar_popup BOOLEAN DEFAULT 1,
                creado_por_id INTEGER REFERENCES usuarios(id),
                fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
                fecha_actualizacion DATETIME
            )
        """)
    else:
        print("  ✅ anuncios ya existe")

    if "anuncios_leidos" not in tables:
        print("  ➕ CREATE TABLE anuncios_leidos")
        cursor.execute("""
            CREATE TABLE anuncios_leidos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
                anuncio_id INTEGER REFERENCES anuncios(id) ON DELETE CASCADE,
                fecha_lectura DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
    else:
        print("  ✅ anuncios_leidos ya existe")

    # -- Configuraciones Stockeo --
    if "configuraciones_stockeo" not in tables:
        print("  ➕ CREATE TABLE configuraciones_stockeo")
        cursor.execute("""
            CREATE TABLE configuraciones_stockeo (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entorno_trabajo_id INTEGER REFERENCES entornos_trabajo(id),
                ruta_csv VARCHAR(500),
                encoding VARCHAR(50) DEFAULT 'utf-8-sig',
                delimitador VARCHAR(5) DEFAULT ';',
                mapeo_columnas VARCHAR(2000),
                intervalo_minutos INTEGER DEFAULT 30,
                activo BOOLEAN DEFAULT 0,
                ultima_ejecucion DATETIME,
                ultimo_resultado VARCHAR(500),
                piezas_importadas INTEGER DEFAULT 0,
                ventas_detectadas INTEGER DEFAULT 0,
                fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
                fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
    else:
        print("  ✅ configuraciones_stockeo ya existe")

    # -- Clientes Interesados --
    if "clientes_interesados" not in tables:
        print("  ➕ CREATE TABLE clientes_interesados")
        cursor.execute("""
            CREATE TABLE clientes_interesados (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entorno_trabajo_id INTEGER NOT NULL REFERENCES entornos_trabajo(id) ON DELETE CASCADE,
                usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                nombre VARCHAR(200) NOT NULL,
                email VARCHAR(200),
                telefono VARCHAR(50),
                pieza_buscada VARCHAR(300),
                marca_coche VARCHAR(100),
                modelo_coche VARCHAR(100),
                anio_coche VARCHAR(10),
                version_coche VARCHAR(150),
                observaciones VARCHAR(1000),
                estado VARCHAR(20) DEFAULT 'pendiente',
                fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
    else:
        print("  ✅ clientes_interesados ya existe")

    # -- Vehículos de Referencia --
    if "vehiculos_referencia" not in tables:
        print("  ➕ CREATE TABLE vehiculos_referencia")
        cursor.execute("""
            CREATE TABLE vehiculos_referencia (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                marca VARCHAR(100) NOT NULL,
                modelo VARCHAR(150) NOT NULL,
                anios_produccion VARCHAR(50),
                rango_anios VARCHAR(20),
                tiene_serie BOOLEAN DEFAULT 0,
                tiene_deportiva BOOLEAN DEFAULT 0,
                observaciones_facelift VARCHAR(500),
                serie_1g VARCHAR(50),
                serie_2g VARCHAR(50),
                serie_3g VARCHAR(50),
                precio_fatal_10 FLOAT,
                precio_mal_13 FLOAT,
                precio_regular_17 FLOAT,
                precio_bien_23 FLOAT,
                precio_vida_deportiva FLOAT,
                valor_minimo_usado FLOAT,
                porcentaje_15 FLOAT,
                porcentaje_20 FLOAT,
                porcentaje_23 FLOAT,
                compatibilidad VARCHAR(500)
            )
        """)
    else:
        print("  ✅ vehiculos_referencia ya existe")

    print()

    # ─── 3. ÍNDICES ───

    print("── 3. Índices ──")
    indexes = get_indexes(cursor)  # Refrescar

    idx_defs = [
        ("ix_sucpaq_entorno", "sucursales_paqueteria(entorno_trabajo_id)"),
        ("ix_regpaq_entorno_fecha", "registros_paquetes(entorno_trabajo_id, fecha_registro)"),
        ("ix_regpaq_usuario_fecha", "registros_paquetes(usuario_id, fecha_registro)"),
        ("ix_regpaq_id_caja", "registros_paquetes(id_caja)"),
        ("ix_regpaq_grupo", "registros_paquetes(grupo_paquete)"),
        ("ix_tipocaja_entorno", "tipos_caja(entorno_trabajo_id)"),
        ("ix_tipocaja_ref_entorno", "tipos_caja(referencia_caja, entorno_trabajo_id)"),
        ("ix_movcaja_tipo_fecha", "movimientos_caja(tipo_caja_id, fecha)"),
        ("ix_movcaja_entorno_fecha", "movimientos_caja(entorno_trabajo_id, fecha)"),
        ("ix_stockcajasuc_tipo_suc", "stock_caja_sucursal(tipo_caja_id, sucursal_paqueteria_id)"),
        ("ix_clienteint_entorno", "clientes_interesados(entorno_trabajo_id)"),
        ("ix_clienteint_estado", "clientes_interesados(estado)"),
        ("ix_vehiculoref_marca", "vehiculos_referencia(marca)"),
        ("ix_vehiculoref_marca_modelo", "vehiculos_referencia(marca, modelo)"),
        ("ix_api_logs_fecha", "api_request_logs(fecha)"),
        ("ix_api_logs_entorno", "api_request_logs(entorno_trabajo_id)"),
        ("ix_api_logs_usuario", "api_request_logs(usuario_id)"),
        ("ix_api_logs_ruta", "api_request_logs(ruta)"),
        ("ix_anuncio_leido_usuario_anuncio", "anuncios_leidos(usuario_id, anuncio_id)"),
    ]

    for name, definition in idx_defs:
        create_index_if_missing(cursor, name, definition, indexes)

    conn.commit()
    conn.close()

    print()
    print("=" * 60)
    print("✅ MIGRACIÓN COMPLETADA")
    print("=" * 60)


if __name__ == "__main__":
    migrar()
