"""
Migración: crear tabla vehiculos_referencia e importar datos del JSON.
Ejecutar: cd backend && python scripts/migrar_vehiculos_referencia.py
"""
import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "desguapro.db"
JSON_PATH = Path(__file__).resolve().parents[1] / "data" / "vehiculos_modernos.json"

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# Crear tabla
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

# Índices
cur.execute("CREATE INDEX IF NOT EXISTS ix_vehiculoref_marca ON vehiculos_referencia(marca)")
cur.execute("CREATE INDEX IF NOT EXISTS ix_vehiculoref_marca_modelo ON vehiculos_referencia(marca, modelo)")

# Verificar si ya hay datos
count = cur.execute("SELECT COUNT(*) FROM vehiculos_referencia").fetchone()[0]
if count > 0:
    print(f"La tabla ya tiene {count} registros. Borrando para reimportar...")
    cur.execute("DELETE FROM vehiculos_referencia")

# Importar JSON
with open(JSON_PATH, encoding="utf-8") as f:
    vehiculos = json.load(f)

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

rows = []
for v in vehiculos:
    row = tuple(v.get(c) for c in cols)
    rows.append(row)

cur.executemany(sql, rows)
conn.commit()

final = cur.execute("SELECT COUNT(*) FROM vehiculos_referencia").fetchone()[0]
marcas = cur.execute("SELECT COUNT(DISTINCT marca) FROM vehiculos_referencia").fetchone()[0]
print(f"OK: {final} registros importados, {marcas} marcas")

conn.close()
