#!/bin/bash
# Ejemplos de curl para testing del API de Autenticación
# Copiar y pegar comandos en la terminal

# ============================================
# CONFIGURACIÓN INICIAL
# ============================================

# 1. CAMBIAR ESTOS VALORES
USUARIO_EMAIL="usuario@ejemplo.com"
USUARIO_PASSWORD="contraseña123"
API_URL="http://localhost:8000/api/v1"

echo "🔐 Testing API de Autenticación"
echo "API: $API_URL"
echo ""

# ============================================
# 1. LOGIN - Obtener Token
# ============================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  LOGIN - Obtener Token JWT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$USUARIO_EMAIL\",
    \"password\": \"$USUARIO_PASSWORD\"
  }")

echo "Respuesta:"
echo "$RESPONSE" | python -m json.tool

# Extraer token
TOKEN=$(echo "$RESPONSE" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "❌ Error: No se obtuvo el token"
    echo "Verifica usuario y contraseña en línea 17-19"
    exit 1
fi

echo ""
echo "✅ Token obtenido:"
echo "$TOKEN"
echo ""

# ============================================
# 2. GET CURRENT USER
# ============================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  GET CURRENT USER - Info del usuario logueado"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

curl -s -X GET "$API_URL/auth/me" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool

echo ""

# ============================================
# 3. GET PLATAFORMAS DISPONIBLES
# ============================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  GET PLATAFORMAS - Listar plataformas disponibles"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

curl -s -X GET "$API_URL/precios/plataformas-disponibles" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool

echo ""

# ============================================
# 4. BUSCAR PRECIOS
# ============================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  BUSCAR PRECIOS - Buscar una pieza"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

curl -s -X POST "$API_URL/precios/buscar" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plataforma": "ecooparts",
    "referencia": "1K0959653C",
    "cantidad": 5
  }' | python -m json.tool

echo ""

# ============================================
# 5. VERIFICAR STOCK (Solo ADMIN/OWNER)
# ============================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣  VERIFICAR STOCK - Comparar precios (ADMIN/OWNER)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  Solo funciona si el usuario es ADMIN u OWNER"
echo ""

curl -s -X POST "$API_URL/stock/verificar" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "ref_id": "1",
        "ref_oem": "1K0959653C",
        "precio_azeler": 45.50
      },
      {
        "ref_id": "2",
        "ref_oem": "1K0612633",
        "precio_azeler": 30.00
      }
    ],
    "umbral_diferencia": 10
  }' | python -m json.tool

echo ""

# ============================================
# SOLO PARA OWNER
# ============================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔑 FUNCIONES SOLO PARA OWNER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 6. LISTAR USUARIOS (Solo OWNER)
echo "6️⃣  LISTAR USUARIOS (Solo OWNER)"
echo ""

curl -s -X GET "$API_URL/auth/usuarios" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool

echo ""

# 7. LISTAR ENTORNOS (Solo OWNER)
echo "7️⃣  LISTAR ENTORNOS (Solo OWNER)"
echo ""

curl -s -X GET "$API_URL/auth/entornos" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool

echo ""

# 8. CREAR NUEVO USUARIO (Solo OWNER)
echo "8️⃣  CREAR NUEVO USUARIO (Solo OWNER)"
echo ""

curl -s -X POST "$API_URL/auth/usuarios" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nuevo.usuario@ejemplo.com",
    "password": "contraseña123"
  }' | python -m json.tool

echo ""

# ============================================
# ERRORES COMUNES
# ============================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "❌ ERRORES COMUNES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "9️⃣  Usar token inválido"
curl -s -X GET "$API_URL/auth/me" \
  -H "Authorization: Bearer token_invalido" | python -m json.tool

echo ""

echo "🔟 Sin token"
curl -s -X GET "$API_URL/auth/me" | python -m json.tool

echo ""

echo "1️⃣1️⃣ Usuario normal accediendo a stock (debe dar error)"
# Necesitarías un token de usuario normal para esto
# curl -s -X POST "$API_URL/stock/verificar" \
#   -H "Authorization: Bearer $TOKEN_USER" ...

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ TESTING COMPLETADO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📚 Más documentación:"
echo "   - http://localhost:8000/docs (Swagger UI)"
echo "   - http://localhost:8000/redoc (ReDoc)"
echo ""
