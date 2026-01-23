import requests

BASE_URL = 'http://localhost:8000/api/v1'

# 1. Login
print('=== TEST LOGIN ===')
r = requests.post(f'{BASE_URL}/auth/login', json={'email': 'julio@motocoche.com', 'password': 'admin123'})
print(f'Login: {r.status_code}')
data = r.json()
token = data.get('access_token')
user = data.get('usuario')
print(f"Usuario: {user['email']} - Rol: {user['rol']}")

headers = {'Authorization': f'Bearer {token}'}

# 2. Dashboard/Usuarios
print()
print('=== TEST USUARIOS ===')
r = requests.get(f'{BASE_URL}/auth/usuarios', headers=headers)
print(f'Usuarios: {r.status_code} - {len(r.json().get("usuarios", []))} usuarios')

# 3. Entornos
print()
print('=== TEST ENTORNOS ===')
r = requests.get(f'{BASE_URL}/auth/entornos', headers=headers)
print(f'Entornos: {r.status_code} - {len(r.json())} entornos')

# 4. Fichadas
print()
print('=== TEST FICHADAS ===')
r = requests.get(f'{BASE_URL}/fichadas/mis-fichadas', headers=headers)
print(f'Fichadas: {r.status_code}')

# 5. Stock
print()
print('=== TEST STOCK ===')
r = requests.get(f'{BASE_URL}/desguace/stock', headers=headers)
print(f'Stock: {r.status_code}')

# 6. Audit Logs
print()
print('=== TEST AUDIT LOGS ===')
r = requests.get(f'{BASE_URL}/admin/audit-logs', headers=headers)
print(f'Audit Logs: {r.status_code}')

# 7. Scheduler status
print()
print('=== TEST SCHEDULER ===')
r = requests.get(f'{BASE_URL}/admin/scheduler/estado', headers=headers)
print(f'Scheduler: {r.status_code} - {r.json()}')

# 8. Logout
print()
print('=== TEST LOGOUT ===')
r = requests.post(f'{BASE_URL}/auth/logout', headers=headers)
print(f'Logout: {r.status_code}')

print()
print('✅ TODOS LOS TESTS COMPLETADOS')
