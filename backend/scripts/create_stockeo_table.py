"""Script para crear la tabla configuraciones_stockeo"""
import sys
sys.path.insert(0, '.')

from app.database import engine
from sqlalchemy import text

# Crear tabla configuraciones_stockeo
try:
    with engine.connect() as conn:
        conn.execute(text('''
            CREATE TABLE IF NOT EXISTS configuraciones_stockeo (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entorno_trabajo_id INTEGER UNIQUE NOT NULL,
                ruta_csv VARCHAR(500),
                encoding VARCHAR(50) DEFAULT 'utf-8-sig',
                delimitador VARCHAR(5) DEFAULT ';',
                mapeo_columnas VARCHAR(2000),
                intervalo_minutos INTEGER DEFAULT 30,
                activo BOOLEAN DEFAULT 0,
                ultima_ejecucion DATETIME,
                ultimo_resultado VARCHAR(500),
                piezas_importadas INTEGER DEFAULT 0,
                ventas_detectadas INTEGER DEFAULT 0,
                fecha_creacion DATETIME,
                fecha_actualizacion DATETIME,
                FOREIGN KEY (entorno_trabajo_id) REFERENCES entornos_trabajo(id)
            )
        '''))
        conn.commit()
        print('✅ Tabla configuraciones_stockeo creada correctamente')
        
        # Verificar
        result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='configuraciones_stockeo'"))
        if result.fetchone():
            print('✅ Tabla verificada en la base de datos')
except Exception as e:
    print(f'❌ Error: {e}')
