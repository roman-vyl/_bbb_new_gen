@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0\.."

if not exist "debug\reports" mkdir "debug\reports"

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%i"
set "REPORT=debug\reports\workbench_%STAMP%.log"
set "LATEST=debug\reports\workbench-latest.log"
set "WORKBENCH_DEBUG_STAMP=%STAMP%"

echo Workbench pipeline debug (Playwright only — does NOT start dev servers)
echo Report: %REPORT%
echo.

REM Optional override: set WORKBENCH_URL=http://127.0.0.1:5174 before running bat
if not defined WORKBENCH_URL (
  call :probe_workbench_url
  if errorlevel 1 exit /b 1
) else (
  echo Using WORKBENCH_URL=%WORKBENCH_URL%
  call :check_url "%WORKBENCH_URL%"
  if errorlevel 1 (
    echo ERROR: WORKBENCH_URL is not reachable: %WORKBENCH_URL%
    exit /b 1
  )
)

REM BFF / Research API (direct — not via Vite proxy)
set "BFF_URL=http://127.0.0.1:8000"
if defined RESEARCH_API_URL set "BFF_URL=%RESEARCH_API_URL%"
call :check_url "%BFF_URL%/health"
if errorlevel 1 (
  echo ERROR: Research API not reachable at %BFF_URL%/health
  echo Start your BFF stack, then re-run this bat.
  exit /b 1
)

echo.
echo Prerequisites:
echo   - Frontend already running at %WORKBENCH_URL%
echo   - Started WITH VITE_EMA_PIPELINE_DEBUG=true ^(restart Vite after changing .env.local^)
echo   - BFF at %BFF_URL%
echo.
echo Running Playwright...
echo   Typical wait: 2-5 min ^(full market bundle on chart can take ~2 min^).
echo   Progress below and in: %REPORT%
echo.

cd frontend
set "PLAYWRIGHT_BASE_URL=%WORKBENCH_URL%"
powershell -NoProfile -Command "$env:PLAYWRIGHT_BASE_URL='%WORKBENCH_URL%'; $env:WORKBENCH_DEBUG_STAMP='%STAMP%'; npx playwright test e2e/workbench-pipeline-debug.spec.ts --reporter=list 2>&1 | Tee-Object -FilePath '..\%REPORT%'"
set "EXITCODE=%ERRORLEVEL%"
cd ..

copy /y "%REPORT%" "%LATEST%" >nul

echo.
echo Saved: %REPORT%
echo Latest: %LATEST%
for %%f in (debug\reports\workbench_*_%STAMP%.txt) do echo Scenario: %%f

exit /b %EXITCODE%

:probe_workbench_url
for %%P in (5173 5174) do (
  set "CANDIDATE=http://127.0.0.1:%%P"
  call :check_url "!CANDIDATE!"
  if not errorlevel 1 (
    set "WORKBENCH_URL=!CANDIDATE!"
    echo Found Workbench at !WORKBENCH_URL!
    exit /b 0
  )
)
echo ERROR: No Workbench on http://127.0.0.1:5173 or :5174
echo Start YOUR frontend dev server ^(this bat does not run npm run dev^).
exit /b 1

:check_url
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri '%~1' -UseBasicParsing -TimeoutSec 5; exit 0 } catch { exit 1 }"
exit /b %ERRORLEVEL%
