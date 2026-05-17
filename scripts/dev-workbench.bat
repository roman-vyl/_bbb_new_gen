@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-workbench.ps1" %*
if errorlevel 1 exit /b 1
pause
