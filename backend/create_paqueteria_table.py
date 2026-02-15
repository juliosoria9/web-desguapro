"""Crear tabla registros_paquetes y eliminar tabla vieja paquetes"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "desguapro.db")
conn = sqlite3.connect(db_path)
c = conn.cursor()

# Eliminar tabla vieja
c.execute("DROP TABLE IF EXISTS paquetes")
print("Tabla paquetes vieja eliminada (si existía)")

# Crear tabla nueva
c.execute("""
    CREATE TABLE IF NOT EXISTS registros_paquetes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
        entorno_trabajo_id INTEGER REFERENCES entornos_trabajo(id) ON DELETE CASCADE,
        id_caja VARCHAR(100),
        id_pieza VARCHAR(100),
        fecha_registro DATETIME
    )
""")

# Crear índices
c.execute("CREATE INDEX IF NOT EXISTS ix_regpaq_entorno_fecha ON registros_paquetes(entorno_trabajo_id, fecha_registro)")
c.execute("CREATE INDEX IF NOT EXISTS ix_regpaq_usuario_fecha ON registros_paquetes(usuario_id, fecha_registro)")
c.execute("CREATE INDEX IF NOT EXISTS ix_regpaq_id_caja ON registros_paquetes(id_caja)")
c.execute("CREATE INDEX IF NOT EXISTS ix_registros_paquetes_id_pieza ON registros_paquetes(id_pieza)")

conn.commit()
print("Tabla registros_paquetes CREADA con índices")

# Verificar
c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%paquet%'")
print("Tablas paquet*:", [r[0] for r in c.fetchall()])

conn.close()
print("DONE")
