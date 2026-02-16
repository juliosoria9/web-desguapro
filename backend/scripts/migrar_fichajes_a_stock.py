"""
Migrar datos de fichaje históricos (versión optimizada):
- Actualizar piezas_desguace con fecha_fichaje y usuario_fichaje_id desde fichadas_piezas
- Actualizar piezas_vendidas con fecha_fichaje y usuario_fichaje_id desde fichadas_piezas
Usa tabla temporal para evitar subqueries correlados lentos.
"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "desguapro.db")
print(f"BD: {db_path}")
conn = sqlite3.connect(db_path, timeout=30)
c = conn.cursor()

# Paso 1: Crear tabla temporal con la última fichada por (id_pieza, entorno)
print("Creando tabla temporal de fichadas únicas...")
c.execute("DROP TABLE IF EXISTS tmp_ultima_fichada")
c.execute("""
    CREATE TEMP TABLE tmp_ultima_fichada AS
    SELECT 
        UPPER(id_pieza) as id_pieza_upper,
        entorno_trabajo_id,
        fecha_fichada,
        usuario_id
    FROM fichadas_piezas
    WHERE id = (
        SELECT id FROM fichadas_piezas f2
        WHERE UPPER(f2.id_pieza) = UPPER(fichadas_piezas.id_pieza)
          AND f2.entorno_trabajo_id = fichadas_piezas.entorno_trabajo_id
        ORDER BY f2.fecha_fichada DESC
        LIMIT 1
    )
""")
c.execute("SELECT COUNT(*) FROM tmp_ultima_fichada")
total_fichadas = c.fetchone()[0]
print(f"Fichadas únicas: {total_fichadas}")

c.execute("CREATE INDEX idx_tmp_fichada ON tmp_ultima_fichada(id_pieza_upper, entorno_trabajo_id)")
print("Índice creado")

# Paso 2: Actualizar piezas_desguace
print("\n--- Migrando fichajes a piezas_desguace ---")
c.execute("""
    UPDATE piezas_desguace
    SET fecha_fichaje = (
        SELECT t.fecha_fichada FROM tmp_ultima_fichada t
        JOIN bases_desguace b ON b.id = piezas_desguace.base_desguace_id
        WHERE t.id_pieza_upper = UPPER(piezas_desguace.refid)
          AND t.entorno_trabajo_id = b.entorno_trabajo_id
    ),
    usuario_fichaje_id = (
        SELECT t.usuario_id FROM tmp_ultima_fichada t
        JOIN bases_desguace b ON b.id = piezas_desguace.base_desguace_id
        WHERE t.id_pieza_upper = UPPER(piezas_desguace.refid)
          AND t.entorno_trabajo_id = b.entorno_trabajo_id
    )
    WHERE piezas_desguace.fecha_fichaje IS NULL
      AND UPPER(piezas_desguace.refid) IN (SELECT id_pieza_upper FROM tmp_ultima_fichada)
""")
stock_actualizadas = c.rowcount
print(f"Piezas en stock actualizadas: {stock_actualizadas}")
conn.commit()

# Paso 3: Actualizar piezas_vendidas
print("\n--- Migrando fichajes a piezas_vendidas ---")
c.execute("""
    UPDATE piezas_vendidas
    SET fecha_fichaje = (
        SELECT t.fecha_fichada FROM tmp_ultima_fichada t
        WHERE t.id_pieza_upper = UPPER(piezas_vendidas.refid)
          AND t.entorno_trabajo_id = piezas_vendidas.entorno_trabajo_id
    ),
    usuario_fichaje_id = (
        SELECT t.usuario_id FROM tmp_ultima_fichada t
        WHERE t.id_pieza_upper = UPPER(piezas_vendidas.refid)
          AND t.entorno_trabajo_id = piezas_vendidas.entorno_trabajo_id
    )
    WHERE piezas_vendidas.fecha_fichaje IS NULL
      AND UPPER(piezas_vendidas.refid) IN (SELECT id_pieza_upper FROM tmp_ultima_fichada)
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
