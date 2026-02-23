"""
Fix: eliminar índice huérfano ix_tipos_caja_id que corrompe el esquema.
Usa writable_schema para operar directamente sobre sqlite_master.
"""
import sqlite3
import sys
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "desguapro.db")

def fix():
    if not os.path.exists(DB_PATH):
        print(f"❌ No se encontró la BD en {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA writable_schema = ON")
    
    # Ver qué hay roto
    rows = conn.execute(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name LIKE '%tipos_caja%'"
    ).fetchall()
    print("Entradas problemáticas encontradas:")
    for r in rows:
        print(f"  type={r[0]}, name={r[1]}, tbl_name={r[2]}")

    # Borrar el índice huérfano
    conn.execute("DELETE FROM sqlite_master WHERE type='index' AND name='ix_tipos_caja_id'")
    
    # Buscar otros índices huérfanos que referencien tablas inexistentes
    all_tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()}
    orphan_indexes = conn.execute(
        "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND tbl_name NOT IN (SELECT name FROM sqlite_master WHERE type='table')"
    ).fetchall()
    for idx_name, tbl_name in orphan_indexes:
        print(f"  Borrando índice huérfano extra: {idx_name} (apunta a tabla inexistente {tbl_name})")
        conn.execute(f"DELETE FROM sqlite_master WHERE type='index' AND name=?", (idx_name,))

    conn.execute("PRAGMA writable_schema = OFF")
    conn.commit()

    # Verificar integridad
    print("\nVerificando integridad...")
    result = conn.execute("PRAGMA integrity_check").fetchone()
    print(f"Resultado: {result[0]}")

    # Intentar listar tablas para confirmar que funciona
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    print(f"\nTablas accesibles: {len(tables)}")
    
    conn.close()
    print("✅ Schema reparado")

if __name__ == "__main__":
    fix()
