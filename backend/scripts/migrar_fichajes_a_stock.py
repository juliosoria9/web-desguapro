"""
Migrar datos de fichaje históricos:
- Actualizar piezas_desguace con fecha_fichaje y usuario_fichaje_id desde fichadas_piezas
- Actualizar piezas_vendidas con fecha_fichaje y usuario_fichaje_id desde fichadas_piezas
"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "desguapro.db")
print(f"BD: {db_path}")
conn = sqlite3.connect(db_path)
c = conn.cursor()

# 1. Actualizar piezas_desguace con datos de fichadas
# Para cada pieza en stock, buscar si hay una fichada con el mismo id_pieza (refid)
# y actualizar fecha_fichaje y usuario_fichaje_id
print("\n--- Migrando fichajes a piezas_desguace ---")
c.execute("""
    UPDATE piezas_desguace
    SET fecha_fichaje = (
        SELECT f.fecha_fichada
        FROM fichadas_piezas f
        JOIN bases_desguace b ON b.id = piezas_desguace.base_desguace_id
        WHERE UPPER(f.id_pieza) = UPPER(piezas_desguace.refid)
          AND f.entorno_trabajo_id = b.entorno_trabajo_id
        ORDER BY f.fecha_fichada DESC
        LIMIT 1
    ),
    usuario_fichaje_id = (
        SELECT f.usuario_id
        FROM fichadas_piezas f
        JOIN bases_desguace b ON b.id = piezas_desguace.base_desguace_id
        WHERE UPPER(f.id_pieza) = UPPER(piezas_desguace.refid)
          AND f.entorno_trabajo_id = b.entorno_trabajo_id
        ORDER BY f.fecha_fichada DESC
        LIMIT 1
    )
    WHERE piezas_desguace.fecha_fichaje IS NULL
      AND EXISTS (
        SELECT 1 FROM fichadas_piezas f
        JOIN bases_desguace b ON b.id = piezas_desguace.base_desguace_id
        WHERE UPPER(f.id_pieza) = UPPER(piezas_desguace.refid)
          AND f.entorno_trabajo_id = b.entorno_trabajo_id
    )
""")
stock_actualizadas = c.rowcount
print(f"Piezas en stock actualizadas: {stock_actualizadas}")

# 2. Actualizar piezas_vendidas con datos de fichadas
print("\n--- Migrando fichajes a piezas_vendidas ---")
c.execute("""
    UPDATE piezas_vendidas
    SET fecha_fichaje = (
        SELECT f.fecha_fichada
        FROM fichadas_piezas f
        WHERE UPPER(f.id_pieza) = UPPER(piezas_vendidas.refid)
          AND f.entorno_trabajo_id = piezas_vendidas.entorno_trabajo_id
        ORDER BY f.fecha_fichada DESC
        LIMIT 1
    ),
    usuario_fichaje_id = (
        SELECT f.usuario_id
        FROM fichadas_piezas f
        WHERE UPPER(f.id_pieza) = UPPER(piezas_vendidas.refid)
          AND f.entorno_trabajo_id = piezas_vendidas.entorno_trabajo_id
        ORDER BY f.fecha_fichada DESC
        LIMIT 1
    )
    WHERE piezas_vendidas.fecha_fichaje IS NULL
      AND EXISTS (
        SELECT 1 FROM fichadas_piezas f
        WHERE UPPER(f.id_pieza) = UPPER(piezas_vendidas.refid)
          AND f.entorno_trabajo_id = piezas_vendidas.entorno_trabajo_id
    )
""")
vendidas_actualizadas = c.rowcount
print(f"Piezas vendidas actualizadas: {vendidas_actualizadas}")

conn.commit()

# Verificar resultados
c.execute("SELECT COUNT(*) FROM piezas_desguace WHERE fecha_fichaje IS NOT NULL")
stock_con_fichaje = c.fetchone()[0]
c.execute("SELECT COUNT(*) FROM piezas_vendidas WHERE fecha_fichaje IS NOT NULL")
vendidas_con_fichaje = c.fetchone()[0]

print(f"\n--- Resultado final ---")
print(f"Piezas en stock con fichaje: {stock_con_fichaje}")
print(f"Piezas vendidas con fichaje: {vendidas_con_fichaje}")

conn.close()
print("DONE")
