@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."

set "EMA_PIPELINE_DEBUG=1"
if not exist "debug\reports" mkdir "debug\reports"

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%i"
set "REPORT=debug\reports\pipeline_%STAMP%.log"
set "LATEST=debug\reports\pipeline-latest.log"

echo Running pipeline debug...
echo Report: %REPORT%
echo.

python research\diagnostics\run_pipeline_debug.py > "%REPORT%" 2>&1
set "EXITCODE=%ERRORLEVEL%"

copy /y "%REPORT%" "%LATEST%" >nul
type "%REPORT%"

echo.
echo Saved: %REPORT%
echo Latest: %LATEST%
exit /b %EXITCODE%
