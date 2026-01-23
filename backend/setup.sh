#!/bin/bash
# Script de Setup Rápido - Desarrollo Local

echo "=================================================="
echo "🚀 SETUP RÁPIDO - Ecooparts Web API + Autenticación"
echo "=================================================="
echo

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar Python
echo -e "${YELLOW}[1/5]${NC} Verificando Python..."
if ! command -v python &> /dev/null; then
    echo -e "${RED}❌ Python no instalado${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Python encontrado${NC}"

# Verificar PostgreSQL
echo -e "${YELLOW}[2/5]${NC} Verificando PostgreSQL..."
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL no instalado${NC}"
    echo "   Instala PostgreSQL desde: https://www.postgresql.org/download/"
    exit 1
fi
echo -e "${GREEN}✅ PostgreSQL encontrado${NC}"

# Crear entorno virtual
echo -e "${YELLOW}[3/5]${NC} Creando entorno virtual..."
cd backend
if [ ! -d "venv" ]; then
    python -m venv venv
    echo -e "${GREEN}✅ Entorno virtual creado${NC}"
else
    echo -e "${GREEN}✅ Entorno virtual ya existe${NC}"
fi

# Activar entorno
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    source venv/Scripts/activate
else
    source venv/bin/activate
fi
echo -e "${GREEN}✅ Entorno virtual activado${NC}"

# Instalar dependencias
echo -e "${YELLOW}[4/5]${NC} Instalando dependencias..."
pip install --upgrade pip > /dev/null 2>&1
pip install -r requirements.txt > /dev/null 2>&1
echo -e "${GREEN}✅ Dependencias instaladas${NC}"

# Configurar .env
echo -e "${YELLOW}[5/5]${NC} Configurando variables de entorno..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "${GREEN}✅ Archivo .env creado${NC}"
    echo -e "${YELLOW}⚠️  IMPORTANTE: Edita .env con tus credenciales de BD${NC}"
else
    echo -e "${GREEN}✅ Archivo .env ya existe${NC}"
fi

echo
echo "=================================================="
echo -e "${GREEN}✅ SETUP COMPLETADO${NC}"
echo "=================================================="
echo
echo "Próximos pasos:"
echo
echo "1️⃣  Edita el archivo backend/.env con:"
echo "   - DATABASE_URL de tu PostgreSQL"
echo "   - SECRET_KEY (usa: python -c \"import secrets; print(secrets.token_urlsafe(32))\")"
echo
echo "2️⃣  Crea la base de datos:"
echo "   createdb ecooparts_web"
echo
echo "3️⃣  Inicializa la BD:"
echo "   python -m scripts.init_db"
echo
echo "4️⃣  Inicia el servidor:"
echo "   python -m uvicorn app.main:app --reload"
echo
echo "5️⃣  Accede a:"
echo "   - API: http://localhost:8000"
echo "   - Docs: http://localhost:8000/docs"
echo "   - ReDoc: http://localhost:8000/redoc"
echo
