#!/usr/bin/env python3
"""
Migración: Crear tablas de sucursales y asignar datos existentes a sucursal "Legacy".

Ejecutar:
    cd backend
    python3 scripts/migrar_sucursales_paqueteria.py

Acciones:
1. Crea tabla sucursales_paqueteria si no existe
2. Crea tabla stock_caja_sucursal si no existe
3. Añade columna sucursal_paqueteria_id a registros_paquetes si no existe
4. Añade columna sucursal_paqueteria_id a movimientos_caja si no existe
5. Por cada entorno_trabajo: crea sucursal "Legacy" (es_legacy=True, activa=False)
6. Asigna todos los registros existentes (sin sucursal) a la sucursal Legacy
"""
import sqlite3
import sys
import os

# Buscar la BD
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "desguapro.db")
if not os.path.exists(DB_PATH):
    DB_PATH = "/var/www/motocoche/backend/desguapro.db"
if not os.path.exists(DB_PATH):
    print(f"❌ No se encuentra la BD en {DB_PATH}")
    sys.exit(1)

print(f"📂 BD: {DB_PATH}")

conn = sqlite3.connect(DB_PATH)
conn.execute("PRAGMA journal_mode=WAL")
cur = conn.cursor()


def column_exists(table: str, column: str) -> bool:
    cols = [row[1] for row in cur.execute(f"PRAGMA table_info({table})").fetchall()]
    return column in cols


def table_exists(table: str) -> bool:
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
    return cur.fetchone() is not None


# 1) Crear tabla sucursales_paqueteria
if not table_exists("sucursales_paqueteria"):
    print("🔧 Creando tabla sucursales_paqueteria...")
    cur.execute("""
        CREATE TABLE sucursales_paqueteria (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entorno_trabajo_id INTEGER NOT NULL,
            nombre VARCHAR(100) NOT NULL,
            color_hex VARCHAR(7) DEFAULT '#3B82F6',
            es_legacy BOOLEAN DEFAULT 0,
            activa BOOLEAN DEFAULT 1,
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (entorno_trabajo_id) REFERENCES entornos_trabajo(id)
        )
    """)
    print("   ✅ Tabla creada")
else:
    print("   ℹ️  Tabla sucursales_paqueteria ya existe")

# 2) Crear tabla stock_caja_sucursal
if not table_exists("stock_caja_sucursal"):
    print("🔧 Creando tabla stock_caja_sucursal...")
    cur.execute("""
        CREATE TABLE stock_caja_sucursal (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo_caja_id INTEGER NOT NULL,
            sucursal_paqueteria_id INTEGER NOT NULL,
            stock_actual INTEGER DEFAULT 0,
            FOREIGN KEY (tipo_caja_id) REFERENCES tipos_caja(id),
            FOREIGN KEY (sucursal_paqueteria_id) REFERENCES sucursales_paqueteria(id),
            UNIQUE (tipo_caja_id, sucursal_paqueteria_id)
        )
    """)
    print("   ✅ Tabla creada")
else:
    print("   ℹ️  Tabla stock_caja_sucursal ya existe")

# 3) Añadir columna sucursal_paqueteria_id a registros_paquetes
if table_exists("registros_paquetes"):
    if not column_exists("registros_paquetes", "sucursal_paqueteria_id"):
        print("🔧 Añadiendo sucursal_paqueteria_id a registros_paquetes...")
        cur.execute("ALTER TABLE registros_paquetes ADD COLUMN sucursal_paqueteria_id INTEGER REFERENCES sucursales_paqueteria(id)")
        print("   ✅ Columna añadida")
    else:
        print("   ℹ️  Columna ya existe en registros_paquetes")
else:
    print("   ⚠️  Tabla registros_paquetes no existe (se creará al iniciar el backend)")

# 4) Añadir columna sucursal_paqueteria_id a movimientos_caja
if table_exists("movimientos_caja"):
    if not column_exists("movimientos_caja", "sucursal_paqueteria_id"):
        print("🔧 Añadiendo sucursal_paqueteria_id a movimientos_caja...")
        cur.execute("ALTER TABLE movimientos_caja ADD COLUMN sucursal_paqueteria_id INTEGER REFERENCES sucursales_paqueteria(id)")
        print("   ✅ Columna añadida")
    else:
        print("   ℹ️  Columna ya existe en movimientos_caja")
else:
    print("   ⚠️  Tabla movimientos_caja no existe (se creará al iniciar el backend)")

conn.commit()

# 5) Crear sucursal Legacy por cada entorno que tenga registros de paquetería
print("\n🏢 Creando sucursales Legacy...")

if table_exists("registros_paquetes"):
    entornos = cur.execute(
        "SELECT DISTINCT entorno_trabajo_id FROM registros_paquetes WHERE entorno_trabajo_id IS NOT NULL"
    ).fetchall()
else:
    entornos = cur.execute("SELECT id FROM entornos_trabajo").fetchall()

for (ent_id,) in entornos:
    legacy = cur.execute(
        "SELECT id FROM sucursales_paqueteria WHERE entorno_trabajo_id = ? AND es_legacy = 1",
        (ent_id,),
    ).fetchone()
    if legacy:
        legacy_id = legacy[0]
        print(f"   ℹ️  Entorno {ent_id}: ya tiene Legacy (id={legacy_id})")
    else:
        cur.execute(
            "INSERT INTO sucursales_paqueteria (entorno_trabajo_id, nombre, color_hex, es_legacy, activa) VALUES (?, 'Legacy', '#9CA3AF', 1, 0)",
            (ent_id,),
        )
        legacy_id = cur.lastrowid
        print(f"   ✅ Entorno {ent_id}: sucursal Legacy creada (id={legacy_id})")

    # 6) Asignar registros sin sucursal a Legacy
    if table_exists("registros_paquetes"):
        sin_sucursal = cur.execute(
            "SELECT COUNT(*) FROM registros_paquetes WHERE entorno_trabajo_id = ? AND sucursal_paqueteria_id IS NULL",
            (ent_id,),
        ).fetchone()[0]
        if sin_sucursal > 0:
            cur.execute(
                "UPDATE registros_paquetes SET sucursal_paqueteria_id = ? WHERE entorno_trabajo_id = ? AND sucursal_paqueteria_id IS NULL",
                (legacy_id, ent_id),
            )
            print(f"   📦 {sin_sucursal} registros asignados a Legacy")
        else:
            print(f"   ℹ️  No hay registros sin sucursal")

    if table_exists("movimientos_caja"):
        sin_suc_mov = cur.execute(
            "SELECT COUNT(*) FROM movimientos_caja WHERE entorno_trabajo_id = ? AND sucursal_paqueteria_id IS NULL",
            (ent_id,),
        ).fetchone()[0]
        if sin_suc_mov > 0:
            cur.execute(
                "UPDATE movimientos_caja SET sucursal_paqueteria_id = ? WHERE entorno_trabajo_id = ? AND sucursal_paqueteria_id IS NULL",
                (legacy_id, ent_id),
            )
            print(f"   📦 {sin_suc_mov} movimientos asignados a Legacy")

conn.commit()
conn.close()

print("\n✅ Migración completada con éxito!")
