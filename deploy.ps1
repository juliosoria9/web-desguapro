# ============================================
# SCRIPT DE DEPLOYMENT PARA VPS (PowerShell)
# Ejecutar desde el directorio del proyecto
# ============================================

param(
    [string]$VpsUser = "root",
    [string]$VpsHost = "72.61.98.80",
    [string]$VpsPath = "/var/www/motocoche",
    [string]$SshKey = ""  # Ruta a clave SSH (opcional)
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Green
Write-Host "   DEPLOYMENT DESGUAPRO                " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# Función para ejecutar comandos SSH
function Invoke-SshCommand {
    param([string]$Command)
    if ($SshKey) {
        ssh -i $SshKey "$VpsUser@$VpsHost" $Command
    } else {
        ssh "$VpsUser@$VpsHost" $Command
    }
}

# 1. Backup de base de datos en VPS
Write-Host "1. Creando backup de base de datos en VPS..." -ForegroundColor Yellow
Invoke-SshCommand "cd $VpsPath && cp -f backend/desguapro.db backend/desguapro_backup_`$(date +%Y%m%d_%H%M%S).db 2>/dev/null || true"

# 2. Parar servicios
Write-Host "2. Parando servicios..." -ForegroundColor Yellow
Invoke-SshCommand "systemctl stop desguapro-backend 2>/dev/null || pm2 stop desguapro-backend 2>/dev/null || true"
Invoke-SshCommand "systemctl stop desguapro-frontend 2>/dev/null || pm2 stop desguapro-frontend 2>/dev/null || true"

# 3. Subir backend (excluyendo DB y cache)
Write-Host "3. Subiendo archivos del backend..." -ForegroundColor Yellow
$backendExcludes = @(
    "--exclude", "__pycache__",
    "--exclude", "*.pyc",
    "--exclude", ".venv",
    "--exclude", "desguapro.db",
    "--exclude", "*.db",
    "--exclude", "toen_cache.txt",
    "--exclude", ".env"
)
rsync -avz --progress @backendExcludes backend/ "$VpsUser@${VpsHost}:$VpsPath/backend/"

# 4. Subir frontend
Write-Host "4. Subiendo archivos del frontend..." -ForegroundColor Yellow
$frontendExcludes = @(
    "--exclude", "node_modules",
    "--exclude", ".next",
    "--exclude", ".env.local"
)
rsync -avz --progress @frontendExcludes frontend/ "$VpsUser@${VpsHost}:$VpsPath/frontend/"

# 5. Instalar dependencias backend
Write-Host "5. Instalando dependencias backend..." -ForegroundColor Yellow
Invoke-SshCommand "cd $VpsPath/backend && source venv/bin/activate && pip install -r requirements.txt"

# 6. Build frontend
Write-Host "6. Instalando dependencias frontend y build..." -ForegroundColor Yellow
Invoke-SshCommand "cd $VpsPath/frontend && npm install && npm run build"

# 7. Reiniciar servicios
Write-Host "7. Reiniciando servicios..." -ForegroundColor Yellow
Invoke-SshCommand "systemctl start desguapro-backend 2>/dev/null || pm2 start desguapro-backend 2>/dev/null || true"
Invoke-SshCommand "systemctl start desguapro-frontend 2>/dev/null || pm2 start desguapro-frontend 2>/dev/null || true"

# 8. Verificar
Write-Host "8. Verificando servicios..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
Invoke-SshCommand "curl -s http://localhost:8000/docs > /dev/null && echo 'Backend OK' || echo 'Backend FAIL'"
Invoke-SshCommand "curl -s http://localhost:3000 > /dev/null && echo 'Frontend OK' || echo 'Frontend FAIL'"

Write-Host "========================================" -ForegroundColor Green
Write-Host "   DEPLOYMENT COMPLETADO!              " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
