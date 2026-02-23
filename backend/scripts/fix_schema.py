"""
Fix: eliminar índice huérfano ix_tipos_caja_id que corrompe el esquema.
Usa writable_schema para borrar directamente sin validar schema.
"""
import sqlite3
import sys
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "desguapro.db")

def fix():
    if not os.path.exists(DB_PATH):
        print(f"❌ No se encontró la BD en {DB_PATH}")
        sys.exit(1)

    # Conectar sin validar nada - solo borrar el índice roto
    conn = sqlite3.connect(DB_PATH)
    print("Activando writable_schema y borrando índice huérfano...")
    conn.execute("PRAGMA writable_schema = ON")
    conn.execute("DELETE FROM sqlite_master WHERE name = 'ix_tipos_caja_id'")
    conn.execute("PRAGMA writable_schema = OFF")
    conn.execute("PRAGMA integrity_check")
    conn.commit()
    conn.close()

    # Reconectar para verificar que funciona
    print("Verificando que la BD es accesible...")
    conn2 = sqlite3.connect(DB_PATH)
    tables = conn2.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    print(f"Tablas accesibles: {len(tables)}")
    integrity = conn2.execute("PRAGMA integrity_check").fetchone()
    print(f"Integridad: {integrity[0]}")
    conn2.close()
    print("✅ Schema reparado")

if __name__ == "__main__":
    fix()
