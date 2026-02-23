"""
Importar TODOS los vehículos (modernos + antiguos) a la tabla vehiculos_referencia.
Ejecutar en VPS: cd /var/www/motocoche/backend && python scripts/importar_vehiculos_vps.py
Ejecutar en local: cd backend && python scripts/importar_vehiculos_vps.py
"""
import json
import sqlite3
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
DB_PATH = BASE_DIR / "desguapro.db"

# Buscar BD
if not DB_PATH.exists():
    DB_PATH = Path("/var/www/motocoche/backend/desguapro.db")
if not DB_PATH.exists():
    print(f"ERROR: No se encuentra la BD")
    exit(1)

print(f"BD: {DB_PATH}")

conn = sqlite3.connect(str(DB_PATH))
cur = conn.cursor()

# Crear tabla si no existe
cur.execute("""
CREATE TABLE IF NOT EXISTS vehiculos_referencia (
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
cur.execute("CREATE INDEX IF NOT EXISTS ix_vehiculoref_marca ON vehiculos_referencia(marca)")
cur.execute("CREATE INDEX IF NOT EXISTS ix_vehiculoref_marca_modelo ON vehiculos_referencia(marca, modelo)")

# Borrar datos existentes para reimportar limpio
count_antes = cur.execute("SELECT COUNT(*) FROM vehiculos_referencia").fetchone()[0]
if count_antes > 0:
    print(f"Borrando {count_antes} registros existentes...")
    cur.execute("DELETE FROM vehiculos_referencia")

# Columnas a importar
cols = [
    "marca", "modelo", "anios_produccion", "rango_anios",
    "tiene_serie", "tiene_deportiva", "observaciones_facelift",
    "serie_1g", "serie_2g", "serie_3g",
    "precio_fatal_10", "precio_mal_13", "precio_regular_17", "precio_bien_23",
    "precio_vida_deportiva", "valor_minimo_usado",
    "porcentaje_15", "porcentaje_20", "porcentaje_23", "compatibilidad",
]
placeholders = ", ".join(["?"] * len(cols))
sql = f"INSERT INTO vehiculos_referencia ({', '.join(cols)}) VALUES ({placeholders})"

total = 0
data_dir = BASE_DIR / "data"

for json_file in ["vehiculos_modernos.json", "vehiculos_antiguos.json"]:
    path = data_dir / json_file
    if not path.exists():
        print(f"AVISO: {json_file} no encontrado, saltando")
        continue

    with open(path, encoding="utf-8") as f:
        vehiculos = json.load(f)

    rows = [tuple(v.get(c) for c in cols) for v in vehiculos]
    cur.executemany(sql, rows)
    total += len(rows)
    print(f"  {json_file}: {len(rows)} registros importados")

conn.commit()

final = cur.execute("SELECT COUNT(*) FROM vehiculos_referencia").fetchone()[0]
marcas = cur.execute("SELECT COUNT(DISTINCT marca) FROM vehiculos_referencia").fetchone()[0]
print(f"\nTotal: {final} registros, {marcas} marcas")
conn.close()
