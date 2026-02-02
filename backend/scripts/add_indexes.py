"""
Script para añadir índices a las tablas de piezas para mejorar el rendimiento.
Ejecutar en el VPS: python scripts/add_indexes.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine

def add_indexes():
    """Añade índices para mejorar el rendimiento de las consultas"""
    
    indexes = [
        # Índices para piezas_desguace
        ("ix_piezas_desguace_marca", "piezas_desguace", "marca"),
        ("ix_piezas_desguace_modelo", "piezas_desguace", "modelo"),
        ("ix_piezas_desguace_base_id", "piezas_desguace", "base_desguace_id"),
        
        # Índices para piezas_vendidas
        ("ix_piezas_vendidas_marca", "piezas_vendidas", "marca"),
        ("ix_piezas_vendidas_modelo", "piezas_vendidas", "modelo"),
        ("ix_piezas_vendidas_entorno_id", "piezas_vendidas", "entorno_trabajo_id"),
        ("ix_piezas_vendidas_fecha_venta", "piezas_vendidas", "fecha_venta"),
    ]
    
    with engine.connect() as conn:
        for index_name, table, column in indexes:
            try:
                # SQLite syntax
                sql = text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table}({column})")
                conn.execute(sql)
                print(f"✓ Índice {index_name} creado en {table}.{column}")
            except Exception as e:
                print(f"✗ Error creando {index_name}: {e}")
        
        conn.commit()
    
    print("\n✓ Todos los índices han sido procesados")

if __name__ == "__main__":
    print("Añadiendo índices para mejorar rendimiento...\n")
    add_indexes()
