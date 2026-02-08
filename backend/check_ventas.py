import sqlite3
c = sqlite3.connect('/var/www/motocoche/backend/desguapro.db').cursor()
c.execute('SELECT COUNT(*) FROM piezas_desguace WHERE base_desguace_id=4')
print('Piezas en BD base 4:', c.fetchone()[0])
c.execute('SELECT COUNT(*) FROM piezas_vendidas')
print('Piezas vendidas:', c.fetchone()[0])
c.execute('SELECT MAX(fecha_venta) FROM piezas_vendidas')
print('Ultima venta:', c.fetchone()[0])