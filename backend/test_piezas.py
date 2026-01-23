import requests

BASE_URL = 'http://localhost:8000/api/v1'

# Login
r = requests.post(f'{BASE_URL}/auth/login', json={'email': 'julio@motocoche.com', 'password': 'admin123'})
token = r.json().get('access_token')
headers = {'Authorization': f'Bearer {token}'}

# Test piezas recientes
print('=== TEST PIEZAS RECIENTES ===')
r = requests.get(f'{BASE_URL}/piezas/recientes', headers=headers)
print(f'Status: {r.status_code}')
print(f'Piezas: {len(r.json().get("piezas", []))}')

# Test crear pieza nueva
print()
print('=== TEST CREAR PIEZA ===')
data = {
    'piezas': [
        {
            'refid': 'TEST001',
            'oem': '1234567890',
            'articulo': 'Faro delantero derecho TEST',
            'marca': 'BMW',
            'modelo': 'Serie 3',
            'precio': 150.00,
            'ubicacion': 'A1-B2'
        }
    ]
}
r = requests.post(f'{BASE_URL}/piezas/nuevas', json=data, headers=headers)
print(f'Status: {r.status_code}')
print(f'Response: {r.json()}')

# Verificar que se creo
print()
print('=== VERIFICAR CREACION ===')
r = requests.get(f'{BASE_URL}/piezas/recientes', headers=headers)
piezas = r.json().get("piezas", [])
print(f'Piezas recientes: {len(piezas)}')
if piezas:
    print(f'Primera pieza: {piezas[0].get("articulo")}')
