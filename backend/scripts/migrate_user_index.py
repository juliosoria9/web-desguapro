"""
Script para migrar el índice de usuarios de único global a único por empresa
"""
from app.database import engine
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        # Ver índices actuales
        result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='usuarios'"))
        print("Índices actuales:")
        for row in result:
            print(f"  - {row[0]}")
        
        # Eliminar índice único global si existe
        try:
            conn.execute(text("DROP INDEX IF EXISTS ix_usuarios_email"))
            print("\n✓ Eliminado índice ix_usuarios_email")
        except Exception as e:
            print(f"Nota: {e}")
        
        # Crear nuevo índice compuesto (único por email + entorno)
        try:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_usuario_email_entorno ON usuarios(email, entorno_trabajo_id)"))
            print("✓ Creado índice ix_usuario_email_entorno (email + entorno)")
        except Exception as e:
            print(f"Error creando índice: {e}")
        
        # Crear índice simple para búsquedas por email
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_usuarios_email_simple ON usuarios(email)"))
            print("✓ Creado índice ix_usuarios_email_simple")
        except Exception as e:
            print(f"Nota: {e}")
        
        conn.commit()
        
        # Verificar
        result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='usuarios'"))
        print("\nÍndices después de migración:")
        for row in result:
            print(f"  - {row[0]}")

if __name__ == "__main__":
    migrate()
    print("\n✅ Migración completada")
