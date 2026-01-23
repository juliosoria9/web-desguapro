# Setup Rápido - Windows PowerShell
# Script de configuración para desarrollo local en Windows

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "🚀 SETUP RÁPIDO - Ecooparts Web API + Autenticación" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Verificar Python
Write-Host "[1/5] Verificando Python..." -ForegroundColor Yellow
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if ($null -eq $pythonCmd) {
    Write-Host "❌ Python no instalado" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Python encontrado" -ForegroundColor Green

# Verificar PostgreSQL
Write-Host "[2/5] Verificando PostgreSQL..." -ForegroundColor Yellow
$psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
if ($null -eq $psqlCmd) {
    Write-Host "❌ PostgreSQL no instalado" -ForegroundColor Red
    Write-Host "   Descárgalo desde: https://www.postgresql.org/download/" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ PostgreSQL encontrado" -ForegroundColor Green

# Ir al directorio backend
Set-Location backend

# Crear entorno virtual
Write-Host "[3/5] Creando entorno virtual..." -ForegroundColor Yellow
if (-not (Test-Path "venv")) {
    python -m venv venv
    Write-Host "✅ Entorno virtual creado" -ForegroundColor Green
} else {
    Write-Host "✅ Entorno virtual ya existe" -ForegroundColor Green
}

# Activar entorno
Write-Host "Activando entorno virtual..." -ForegroundColor Yellow
& .\venv\Scripts\Activate.ps1
Write-Host "✅ Entorno virtual activado" -ForegroundColor Green

# Instalar dependencias
Write-Host "[4/5] Instalando dependencias..." -ForegroundColor Yellow
python -m pip install --upgrade pip | Out-Null
pip install -r requirements.txt | Out-Null
Write-Host "✅ Dependencias instaladas" -ForegroundColor Green

# Configurar .env
Write-Host "[5/5] Configurando variables de entorno..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Copy-Item .env.example .env
    Write-Host "✅ Archivo .env creado" -ForegroundColor Green
    Write-Host "⚠️  IMPORTANTE: Edita .env con tus credenciales de BD" -ForegroundColor Yellow
} else {
    Write-Host "✅ Archivo .env ya existe" -ForegroundColor Green
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "✅ SETUP COMPLETADO" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Próximos pasos:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1️⃣  Edita el archivo backend\.env con:" -ForegroundColor Yellow
Write-Host "   - DATABASE_URL de tu PostgreSQL" -ForegroundColor White
Write-Host "   - SECRET_KEY (usa en PowerShell):" -ForegroundColor White
Write-Host "     [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Random).ToString() * 100)) | ForEach-Object { `$_.Substring(0,32) }" -ForegroundColor Gray
Write-Host ""
Write-Host "2️⃣  Crea la base de datos:" -ForegroundColor Yellow
Write-Host "   createdb ecooparts_web" -ForegroundColor White
Write-Host "   (o en pgAdmin)"  -ForegroundColor Gray
Write-Host ""
Write-Host "3️⃣  Inicializa la BD:" -ForegroundColor Yellow
Write-Host "   python -m scripts.init_db" -ForegroundColor White
Write-Host ""
Write-Host "4️⃣  Inicia el servidor:" -ForegroundColor Yellow
Write-Host "   python -m uvicorn app.main:app --reload" -ForegroundColor White
Write-Host ""
Write-Host "5️⃣  Accede a:" -ForegroundColor Yellow
Write-Host "   - API: http://localhost:8000" -ForegroundColor Cyan
Write-Host "   - Docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "   - ReDoc: http://localhost:8000/redoc" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 TIPS:" -ForegroundColor Yellow
Write-Host "   - Usa Ctrl+C para detener el servidor" -ForegroundColor White
Write-Host "   - En Swagger UI puedes probar todos los endpoints" -ForegroundColor White
Write-Host "   - Guarda el token JWT en Notepad para testing" -ForegroundColor White
Write-Host ""
