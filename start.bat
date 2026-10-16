@echo off
setlocal
cd /d "%~dp0"

where mvn >nul 2>&1
if errorlevel 1 (
    echo [ERROR] mvn not found on PATH. Install Maven and Java 21.
    pause
    exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found on PATH. Install Node.js.
    pause
    exit /b 1
)

set "READY_URL=http://localhost:8080/alfresco/api/-default-/public/alfresco/versions/1/probes/-ready-"
set "CODE=000"
for /f %%i in ('curl -s -o NUL -w "%%{http_code}" "%READY_URL%" 2^>nul') do set "CODE=%%i"
if not "%CODE%"=="200" (
    echo [WARN] Alfresco is not ready ^(HTTP %CODE%^). Run "docker compose up -d" and wait for the probe to return 200.
    echo        Starting the applications anyway.
)

if not exist "web\node_modules" (
    echo Installing web dependencies...
    pushd web
    call npm install
    popd
)

start "Zapis API (8081)" /D "%~dp0api" cmd /k mvn spring-boot:run
start "Zapis Web (5173)" /D "%~dp0web" cmd /k npm run dev

echo.
echo API: http://localhost:8081
echo Web: http://localhost:5173
endlocal
