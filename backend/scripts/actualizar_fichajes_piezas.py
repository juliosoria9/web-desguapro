#!/usr/bin/env python3
"""
Script para actualizar los campos fecha_fichaje y usuario_fichaje_id en piezas_desguace
basándose en las fichadas registradas en fichadas_piezas
"""
import sqlite3

def actualizar_fichajes():
    db_path = "c:/Users/julio/Music/motocoche programas/web-desguapro/backend/desguapro.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("Actualizando campos de fichaje en piezas_desguace...")
        
        # Actualizar piezas_desguace con datos de fichadas_piezas usando SQL directo
        # Esto es mucho más eficiente que cargar todo en memoria
        
        update_query = """
        UPDATE piezas_desguace
        SET fecha_fichaje = (
            SELECT f.fecha_fichada
            FROM fichadas_piezas f
            JOIN bases_desguace b ON b.entorno_trabajo_id = f.entorno_trabajo_id
            WHERE UPPER(f.id_pieza) = UPPER(piezas_desguace.refid)
            AND piezas_desguace.base_desguace_id = b.id
            ORDER BY f.fecha_fichada DESC
            LIMIT 1
        ),
        usuario_fichaje_id = (
            SELECT f.usuario_id
            FROM fichadas_piezas f
            JOIN bases_desguace b ON b.entorno_trabajo_id = f.entorno_trabajo_id
            WHERE UPPER(f.id_pieza) = UPPER(piezas_desguace.refid)
            AND piezas_desguace.base_desguace_id = b.id
            ORDER BY f.fecha_fichada DESC
            LIMIT 1
        )
        WHERE EXISTS (
            SELECT 1 FROM fichadas_piezas f
            JOIN bases_desguace b ON b.entorno_trabajo_id = f.entorno_trabajo_id
            WHERE UPPER(f.id_pieza) = UPPER(piezas_desguace.refid)
            AND piezas_desguace.base_desguace_id = b.id
        )
        """
        
        print("Ejecutando actualización...")
        cursor.execute(update_query)
        actualizadas = cursor.rowcount
        conn.commit()
        
        print(f"Piezas actualizadas: {actualizadas}")
        
        # Verificar resultados
        cursor.execute("SELECT COUNT(*) FROM piezas_desguace WHERE usuario_fichaje_id IS NOT NULL")
        piezas_con_fichaje = cursor.fetchone()[0]
        print(f"Total piezas con usuario_fichaje_id: {piezas_con_fichaje}")
        
        # También actualizar piezas_vendidas
        print("\nActualizando piezas_vendidas...")
        
        update_vendidas = """
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
        WHERE EXISTS (
            SELECT 1 FROM fichadas_piezas f
            WHERE UPPER(f.id_pieza) = UPPER(piezas_vendidas.refid)
            AND f.entorno_trabajo_id = piezas_vendidas.entorno_trabajo_id
        )
        """
        
        cursor.execute(update_vendidas)
        vendidas_actualizadas = cursor.rowcount
        conn.commit()
        
        print(f"Piezas vendidas actualizadas: {vendidas_actualizadas}")
        
        cursor.execute("SELECT COUNT(*) FROM piezas_vendidas WHERE usuario_fichaje_id IS NOT NULL")
        vendidas_con_fichaje = cursor.fetchone()[0]
        print(f"Total piezas vendidas con usuario_fichaje_id: {vendidas_con_fichaje}")
        
    except Exception as e:
        conn.rollback()
        print(f"Error: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    actualizar_fichajes()
