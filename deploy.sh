#!/bin/bash
# ============================================
# SCRIPT DE DEPLOYMENT PARA VPS
# Ejecutar desde el directorio del proyecto
# ============================================

set -e  # Salir si hay error

# Configuración - TU VPS
VPS_USER="root"
VPS_HOST="72.61.98.80"
VPS_PATH="/var/www/motocoche"
SSH_KEY=""  # Dejar vacío si usas contraseña, o poner ruta a la clave SSH

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   DEPLOYMENT DESGUAPRO               ${NC}"
echo -e "${GREEN}========================================${NC}"

# Función SSH
ssh_cmd() {
    if [ -n "$SSH_KEY" ]; then
        ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "$1"
    else
        ssh "$VPS_USER@$VPS_HOST" "$1"
    fi
}

# Función SCP
scp_cmd() {
    if [ -n "$SSH_KEY" ]; then
        scp -i "$SSH_KEY" -r "$1" "$VPS_USER@$VPS_HOST:$2"
    else
        scp -r "$1" "$VPS_USER@$VPS_HOST:$2"
    fi
}

echo -e "${YELLOW}1. Creando backup de base de datos en VPS...${NC}"
ssh_cmd "cd $VPS_PATH && cp -f backend/desguapro.db backend/desguapro_backup_\$(date +%Y%m%d_%H%M%S).db 2>/dev/null || true"

echo -e "${YELLOW}2. Parando servicios...${NC}"
ssh_cmd "systemctl stop desguapro-backend 2>/dev/null || true"
ssh_cmd "systemctl stop desguapro-frontend 2>/dev/null || true"
# O si usas PM2:
ssh_cmd "pm2 stop desguapro-backend 2>/dev/null || true"
ssh_cmd "pm2 stop desguapro-frontend 2>/dev/null || true"

echo -e "${YELLOW}3. Subiendo archivos del backend...${NC}"
# Excluir archivos innecesarios
rsync -avz --progress \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude '.venv' \
    --exclude 'desguapro.db' \
    --exclude '*.db' \
    --exclude 'toen_cache.txt' \
    --exclude '.env' \
    backend/ "$VPS_USER@$VPS_HOST:$VPS_PATH/backend/"

echo -e "${YELLOW}4. Subiendo archivos del frontend...${NC}"
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude '.env.local' \
    frontend/ "$VPS_USER@$VPS_HOST:$VPS_PATH/frontend/"

echo -e "${YELLOW}5. Instalando dependencias backend...${NC}"
ssh_cmd "cd $VPS_PATH/backend && source venv/bin/activate && pip install -r requirements.txt"

echo -e "${YELLOW}6. Instalando dependencias frontend y build...${NC}"
ssh_cmd "cd $VPS_PATH/frontend && npm install && npm run build"

echo -e "${YELLOW}7. Reiniciando servicios...${NC}"
# Con systemd:
ssh_cmd "systemctl start desguapro-backend 2>/dev/null || true"
ssh_cmd "systemctl start desguapro-frontend 2>/dev/null || true"
# O con PM2:
ssh_cmd "pm2 start desguapro-backend 2>/dev/null || true"
ssh_cmd "pm2 start desguapro-frontend 2>/dev/null || true"

echo -e "${YELLOW}8. Verificando servicios...${NC}"
sleep 3
ssh_cmd "curl -s http://localhost:8000/docs > /dev/null && echo 'Backend OK' || echo 'Backend FAIL'"
ssh_cmd "curl -s http://localhost:3000 > /dev/null && echo 'Frontend OK' || echo 'Frontend FAIL'"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   DEPLOYMENT COMPLETADO!              ${NC}"
echo -e "${GREEN}========================================${NC}"
