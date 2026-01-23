# Start backend server
Set-Location $PSScriptRoot
& "c:\Users\Julio\Music\motocoche\motococheprograma\.venv\Scripts\python.exe" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
