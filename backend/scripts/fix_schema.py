"""
Fix: eliminar índice huérfano ix_tipos_caja_id que corrompe el esquema.
Intenta múltiples estrategias hasta que una funcione.
"""
import sqlite3
import subprocess
import shutil
import sys
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "desguapro.db")


def backup():
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak = f"{DB_PATH}.backup_{ts}"
    shutil.copy2(DB_PATH, bak)
    print(f"Backup creado: {bak}")
    return bak


def verify(db_path=None):
    db = db_path or DB_PATH
    try:
        conn = sqlite3.connect(db)
        tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        count = conn.execute("SELECT count(*) FROM piezas_desguace").fetchone()[0]
        conn.close()
        print(f"  ✓ {len(tables)} tablas, {count} piezas en stock")
        return count > 0
    except Exception as e:
        print(f"  ✗ Verificación falló: {e}")
        return False


def try_executescript():
    """executescript() no usa cursores implícitos y puede evitar la validación."""
    print("\n--- Intento 1: executescript() ---")
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.executescript("""
            PRAGMA writable_schema = ON;
            DELETE FROM sqlite_master WHERE name = 'ix_tipos_caja_id';
            PRAGMA writable_schema = OFF;
        """)
        conn.close()
        print("  Ejecutado sin error")
        return True
    except Exception as e:
        print(f"  Falló: {e}")
        return False


def try_autocommit():
    """isolation_level=None evita transacciones automáticas."""
    print("\n--- Intento 2: autocommit mode ---")
    try:
        conn = sqlite3.connect(DB_PATH, isolation_level=None)
        conn.execute("PRAGMA writable_schema = ON")
        conn.execute("DELETE FROM sqlite_master WHERE name = 'ix_tipos_caja_id'")
        conn.execute("PRAGMA writable_schema = OFF")
        conn.close()
        print("  Ejecutado sin error")
        return True
    except Exception as e:
        print(f"  Falló: {e}")
        return False


def try_cli_writable():
    """Usar sqlite3 CLI que puede manejar writable_schema de forma distinta."""
    print("\n--- Intento 3: sqlite3 CLI ---")
    try:
        sql = (
            "PRAGMA writable_schema=ON;\n"
            "DELETE FROM sqlite_master WHERE name='ix_tipos_caja_id';\n"
            "PRAGMA writable_schema=OFF;\n"
            ".quit\n"
        )
        r = subprocess.run(
            ["sqlite3", DB_PATH],
            input=sql, capture_output=True, text=True, timeout=30
        )
        print(f"  stdout: {r.stdout.strip()}")
        if r.stderr.strip():
            print(f"  stderr: {r.stderr.strip()}")
        if r.returncode == 0 and "malformed" not in r.stderr.lower():
            return True
        return False
    except FileNotFoundError:
        print("  sqlite3 CLI no encontrado")
        return False
    except Exception as e:
        print(f"  Falló: {e}")
        return False


def try_recover():
    """Usar .recover para reconstruir la BD desde datos crudos."""
    print("\n--- Intento 4: .recover ---")
    new_db = "/tmp/desguapro_recovered.db"
    try:
        if os.path.exists(new_db):
            os.remove(new_db)

        r = subprocess.run(
            ["sqlite3", DB_PATH, ".recover"],
            capture_output=True, text=True, timeout=600
        )
        if not r.stdout.strip():
            print("  .recover no produjo salida")
            return False

        print(f"  .recover generó {len(r.stdout)} bytes de SQL")
        if r.stderr.strip():
            print(f"  warnings: {r.stderr[:300]}")

        r2 = subprocess.run(
            ["sqlite3", new_db],
            input=r.stdout, capture_output=True, text=True, timeout=600
        )
        if r2.stderr.strip():
            print(f"  import warnings: {r2.stderr[:300]}")

        if verify(new_db):
            shutil.move(new_db, DB_PATH)
            print("  BD reemplazada con versión recuperada")
            return True
        return False
    except FileNotFoundError:
        print("  sqlite3 CLI no encontrado")
        return False
    except Exception as e:
        print(f"  Falló: {e}")
        return False


def try_dump_filter():
    """Hacer .dump, filtrar la línea problemática, reimportar."""
    print("\n--- Intento 5: .dump + filtrar ---")
    new_db = "/tmp/desguapro_dumped.db"
    try:
        if os.path.exists(new_db):
            os.remove(new_db)

        r = subprocess.run(
            ["sqlite3", DB_PATH, ".dump"],
            capture_output=True, text=True, timeout=600
        )
        if not r.stdout.strip():
            print("  .dump no produjo salida")
            return False

        print(f"  .dump generó {len(r.stdout)} bytes")
        lines = r.stdout.split('\n')
        filtered = [l for l in lines if 'ix_tipos_caja_id' not in l]
        removed = len(lines) - len(filtered)
        print(f"  Filtradas {removed} líneas con ix_tipos_caja_id")

        r2 = subprocess.run(
            ["sqlite3", new_db],
            input='\n'.join(filtered),
            capture_output=True, text=True, timeout=600
        )
        if r2.stderr.strip():
            print(f"  import warnings: {r2.stderr[:300]}")

        if verify(new_db):
            shutil.move(new_db, DB_PATH)
            print("  BD reemplazada con versión filtrada")
            return True
        return False
    except FileNotFoundError:
        print("  sqlite3 CLI no encontrado")
        return False
    except Exception as e:
        print(f"  Falló: {e}")
        return False


def try_manual_copy():
    """Crear BD nueva y copiar tablas una a una vía Python."""
    print("\n--- Intento 6: copia manual tabla a tabla ---")
    new_db = "/tmp/desguapro_manual.db"
    try:
        if os.path.exists(new_db):
            os.remove(new_db)

        # Leer el schema directamente del binario del archivo
        # Buscamos las sentencias CREATE TABLE en el archivo raw
        with open(DB_PATH, 'rb') as f:
            raw = f.read()

        # Encontrar sentencias CREATE TABLE en el archivo binario
        import re
        # SQLite almacena el SQL como texto en las páginas
        creates = re.findall(
            rb'(CREATE TABLE [^\x00]+)',
            raw
        )

        if not creates:
            print("  No se encontraron CREATE TABLE en el binario")
            return False

        print(f"  Encontradas {len(creates)} sentencias CREATE TABLE")

        # Conectar a la BD original con writable_schema para intentar leer datos
        # Usamos ATTACH para copiar tabla por tabla
        new_conn = sqlite3.connect(new_db)
        new_cur = new_conn.cursor()

        # Crear tablas en BD nueva
        for stmt in creates:
            try:
                sql = stmt.decode('utf-8', errors='ignore').strip()
                # Limpiar caracteres basura al final
                sql = sql.split('\x00')[0].strip()
                if sql and sql.upper().startswith('CREATE TABLE'):
                    # Asegurar que termina en )
                    if ')' in sql:
                        sql = sql[:sql.rindex(')') + 1]
                        new_cur.execute(sql)
            except Exception:
                pass

        new_conn.commit()

        # Ahora intentar ATTACH la BD corrupta y copiar datos
        try:
            new_cur.execute(f"ATTACH DATABASE '{DB_PATH}' AS corrupta")
            tables = new_cur.execute(
                "SELECT name FROM main.sqlite_master WHERE type='table'"
            ).fetchall()

            for (tbl,) in tables:
                try:
                    new_cur.execute(f"INSERT INTO main.{tbl} SELECT * FROM corrupta.{tbl}")
                    count = new_cur.execute(f"SELECT count(*) FROM main.{tbl}").fetchone()[0]
                    print(f"  {tbl}: {count} filas copiadas")
                except Exception as e:
                    print(f"  {tbl}: error - {e}")

            new_conn.commit()
            new_cur.execute("DETACH DATABASE corrupta")
        except Exception as e:
            print(f"  ATTACH falló: {e}")
            new_conn.close()
            return False

        new_conn.close()

        if verify(new_db):
            shutil.move(new_db, DB_PATH)
            print("  BD reemplazada con copia manual")
            return True
        return False
    except Exception as e:
        print(f"  Falló: {e}")
        return False


def main():
    print("=" * 60)
    print("FIX SCHEMA - Múltiples estrategias")
    print(f"BD: {DB_PATH}")
    print("=" * 60)

    if not os.path.exists(DB_PATH):
        print(f"❌ No se encontró la BD")
        sys.exit(1)

    backup()

    strategies = [
        ("executescript", try_executescript),
        ("autocommit", try_autocommit),
        ("CLI writable_schema", try_cli_writable),
        (".recover", try_recover),
        (".dump + filtrar", try_dump_filter),
        ("copia manual", try_manual_copy),
    ]

    for name, fn in strategies:
        if fn():
            if verify():
                print(f"\n✅ REPARADO con: {name}")
                return
            else:
                print(f"  {name} ejecutó pero verificación falló, siguiente...")

    print("\n❌ TODOS LOS INTENTOS FALLARON")
    print("Opción manual: conectar con sqlite3 CLI y probar:")
    print(f"  sqlite3 {DB_PATH}")
    print("  PRAGMA writable_schema=ON;")
    print("  SELECT rowid, type, name FROM sqlite_master;")
    sys.exit(1)


if __name__ == "__main__":
    main()
