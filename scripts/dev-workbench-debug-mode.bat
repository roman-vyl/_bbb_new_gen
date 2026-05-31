@echo off
REM Same as dev-workbench.bat, but Vite starts with VITE_EMA_PIPELINE_DEBUG=true.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-workbench.ps1" -PipelineDebug %*
if errorlevel 1 exit /b 1
pause
