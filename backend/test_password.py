import bcrypt
import sqlite3

# Conectar a la base de datos
conn = sqlite3.connect(r'C:\Users\julio\Music\motocoche programas\web-desguapro\backend\desguapro.db')
cursor = conn.execute('SELECT email, password_hash FROM usuarios WHERE email = ?', ('julio@motocoche.com',))
row = cursor.fetchone()

email = row[0]
stored_hash = row[1]
password = 'admin123'

print(f"Email: {email}")
print(f"Hash almacenado: {stored_hash}")
print(f"Longitud hash: {len(stored_hash)}")

# Verificar
try:
    result = bcrypt.checkpw(password.encode('utf-8'), stored_hash.encode('utf-8'))
    print(f"Contraseña válida: {result}")
except Exception as e:
    print(f"Error: {e}")

# Si no es válido, crear un nuevo hash
if not result:
    print("\nCreando nuevo hash para admin123...")
    new_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8')
    print(f"Nuevo hash: {new_hash}")
    
    # Actualizar en la base de datos
    conn.execute('UPDATE usuarios SET password_hash = ? WHERE email = ?', (new_hash, 'julio@motocoche.com'))
    conn.commit()
    print("Hash actualizado en la base de datos")

conn.close()
