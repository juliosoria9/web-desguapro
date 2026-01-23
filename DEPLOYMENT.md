# 🚀 Guía de Deployment - DesguaPro

## Tu VPS
- **IP**: `72.61.98.80`
- **Ruta**: `/var/www/motocoche`
- **Conexión**: `ssh root@72.61.98.80`

## Requisitos en el VPS

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install python3.11 python3.11-venv nodejs npm nginx

# Instalar PM2 para gestionar procesos
sudo npm install -g pm2
```

## Primera instalación en VPS

### 1. Crear estructura de carpetas

```bash
sudo mkdir -p /var/www/motocoche
sudo chown $USER:$USER /var/www/motocoche
cd /var/www/motocoche
```

### 2. Subir archivos desde Windows

```powershell
# Desde tu PC Windows, en el directorio del proyecto:
scp -r backend root@72.61.98.80:/var/www/motocoche/
scp -r frontend root@72.61.98.80:/var/www/motocoche/
```

### 3. Configurar Backend

```bash
cd /var/www/motocoche/backend

# Crear entorno virtual
python3.11 -m venv venv
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Instalar Playwright para scrapers
playwright install chromium
playwright install-deps

# Crear archivo .env
cat > .env << EOF
SECRET_KEY=tu-clave-secreta-muy-larga-y-segura-$(openssl rand -hex 32)
DATABASE_URL=sqlite:///./desguapro.db
CORS_ORIGINS=["https://tudominio.com","http://localhost:3000"]
COOKIE_SECURE=true
DEBUG=false
EOF
```

### 4. Configurar Frontend

```bash
cd /var/www/motocoche/frontend

# Instalar dependencias
npm install

# Crear archivo .env.local
cat > .env.local << EOF
NEXT_PUBLIC_API_URL=https://api.tudominio.com
EOF

# Build de producción
npm run build
```

### 5. Configurar PM2

```bash
# Backend
pm2 start "cd /var/www/motocoche/backend && source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000" --name motocoche-backend

# Frontend
pm2 start "cd /var/www/motocoche/frontend && npm start" --name motocoche-frontend

# Guardar configuración para reinicio automático
pm2 save
pm2 startup
```

### 6. Configurar Nginx

```bash
sudo nano /etc/nginx/sites-available/desguapro
```

Contenido:

```nginx
# Frontend
server {
    listen 80;
    server_name tudominio.com www.tudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Backend API
server {
    listen 80;
    server_name api.tudominio.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts para scrapers lentos
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Activar:

```bash
sudo ln -s /etc/nginx/sites-available/desguapro /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7. SSL con Certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d tudominio.com -d www.tudominio.com -d api.tudominio.com
```

---

## Actualizar (Deployment)

### Opción A: Script automático

```powershell
# Ya configurado con tu IP, solo ejecuta:
.\deploy.ps1
```

### Opción B: Manual desde Windows

```powershell
# 1. Backup de DB en VPS (SSH)
ssh root@72.61.98.80 "cd /var/www/motocoche && cp backend/desguapro.db backend/backup_$(Get-Date -Format 'yyyyMMdd').db"

# 2. Parar servicios
ssh root@72.61.98.80 "pm2 stop all"

# 3. Subir backend (sin DB)
rsync -avz --progress `
    --exclude '__pycache__' `
    --exclude '*.pyc' `
    --exclude '.venv' `
    --exclude '*.db' `
    --exclude 'toen_cache.txt' `
    --exclude '.env' `
    backend/ root@72.61.98.80:/var/www/motocoche/backend/

# 4. Subir frontend (sin node_modules)
rsync -avz --progress `
    --exclude 'node_modules' `
    --exclude '.next' `
    --exclude '.env.local' `
    frontend/ root@72.61.98.80:/var/www/motocoche/frontend/

# 5. En VPS: instalar deps y rebuild
ssh root@72.61.98.80 "cd /var/www/motocoche/backend && source venv/bin/activate && pip install -r requirements.txt"
ssh root@72.61.98.80 "cd /var/www/motocoche/frontend && npm install && npm run build"

# 6. Reiniciar
ssh root@72.61.98.80 "pm2 restart all"
```

---

## Comandos útiles en VPS

```bash
# Ver logs
pm2 logs motocoche-backend
pm2 logs motocoche-frontend

# Estado de servicios
pm2 status

# Reiniciar
pm2 restart motocoche-backend
pm2 restart motocoche-frontend

# Ver uso de recursos
pm2 monit

# Backup manual de DB
cp /var/www/motocoche/backend/desguapro.db ~/backup_$(date +%Y%m%d).db
```

---

## Troubleshooting

### Error de Playwright en VPS

```bash
cd /var/www/motocoche/backend
source venv/bin/activate
playwright install chromium
playwright install-deps
```

### Error de permisos

```bash
sudo chown -R $USER:$USER /var/www/motocoche
```

### Base de datos corrupta

```bash
# Restaurar último backup
cp /var/www/desguapro/backend/desguapro_backup_FECHA.db /var/www/desguapro/backend/desguapro.db
pm2 restart desguapro-backend
```
