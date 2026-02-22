"""
Migración: añadir columna grupo_paquete a registros_paquetes.
Permite agrupar múltiples cajas/materiales bajo una misma pieza.
"""
import sqlite3
import sys
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "desguapro.db")


def migrar():
    if not os.path.exists(DB_PATH):
        print(f"❌ No se encontró la BD en {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Comprobar si ya existe la columna
    cursor.execute("PRAGMA table_info(registros_paquetes)")
    columnas = [col[1] for col in cursor.fetchall()]

    if "grupo_paquete" in columnas:
        print("✅ La columna grupo_paquete ya existe, nada que hacer")
        conn.close()
        return

    print("➕ Añadiendo columna grupo_paquete a registros_paquetes...")
    cursor.execute("ALTER TABLE registros_paquetes ADD COLUMN grupo_paquete VARCHAR(36)")

    print("➕ Creando índice ix_regpaq_grupo...")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_regpaq_grupo ON registros_paquetes(grupo_paquete)")

    conn.commit()
    conn.close()
    print("✅ Migración completada")


if __name__ == "__main__":
    migrar()
