@echo off
cd /d "%~dp0backend"
if not exist ".venv\Scripts\python.exe" (
  echo Python backend is not installed. Follow the setup steps in README.md.
  pause
  exit /b 1
)
powershell -NoProfile -Command "try { if ((Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2).status -eq 'ok') { exit 0 } } catch { }; exit 1" >nul 2>&1
if not errorlevel 1 (
  echo Transcript server is already running at http://127.0.0.1:8000/health
  pause
  exit /b 0
)
echo Starting local transcript server at http://127.0.0.1:8000/health
echo Keep this window open while creating or downloading transcripts.
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
echo Transcript server stopped.
pause
