@echo off
REM HEADROOM launcher for 3D Astroids + Ollama
REM Purpose: start the HEADROOM optimization proxy from the project root and keep it alive
REM Setup: requires headroom-ai installed in %USERPROFILE%\.claude\tools\headroom\.venv
REM Issues: HEADROOM can exit silently if the port is in use or on internal errors
REM Fix: auto-kill stale port holders, capture all output, auto-restart on crash
REM Gotchas: keep this terminal open while coding. Cold-start optimization latency is ~5s.
setlocal EnableDelayedExpansion
set HEADROOM_HOST=127.0.0.1
set HEADROOM_PORT=8787
set "HEADROOM_VENV=%USERPROFILE%\.claude\tools\headroom\.venv"
set "HEADROOM_LOG=%CD%\.headroom\proxy.log"
set "LAUNCHER_LOG=%CD%\.headroom\launcher.log"
set MAX_RETRIES=10
set RETRY_DELAY_SEC=5
set RESTART_COUNT=0

if not exist "%CD%\.headroom" mkdir "%CD%\.headroom"

:clear_logs
echo [%date% %time%] HEADROOM launcher starting > "%LAUNCHER_LOG%"
echo [%date% %time%] Proxy log: %HEADROOM_LOG% >> "%LAUNCHER_LOG%"
echo. > "%HEADROOM_LOG%"

:cleanup_port
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%HEADROOM_PORT%" ^| findstr "LISTENING"') do (
  echo [%date% %time%] Found stale process %%a on port %HEADROOM_PORT% >> "%LAUNCHER_LOG%"
  taskkill /PID %%a /F >> "%LAUNCHER_LOG%" 2>&1
  ping -n 3 127.0.0.1 > nul
)

:launch
echo [%date% %time%] Launching HEADROOM (attempt !RESTART_COUNT!/%MAX_RETRIES%) >> "%LAUNCHER_LOG%"

"%HEADROOM_VENV%\Scripts\headroom.exe" proxy --host %HEADROOM_HOST% --port %HEADROOM_PORT% --anthropic-api-url http://127.0.0.1:11434 --log-file "%HEADROOM_LOG%" --code-aware >> "%LAUNCHER_LOG%" 2>&1
set EXIT_CODE=%ERRORLEVEL%

set /a RESTART_COUNT+=1

if %EXIT_CODE% equ 0 (
  echo [%date% %time%] HEADROOM exited cleanly. >> "%LAUNCHER_LOG%"
  goto :done
)

echo [%date% %time%] HEADROOM exited with code %EXIT_CODE%. >> "%LAUNCHER_LOG%"

if %RESTART_COUNT% geq %MAX_RETRIES% (
  echo [%date% %time%] Maximum retries reached. Giving up. >> "%LAUNCHER_LOG%"
  echo HEADROOM failed to stay running after %MAX_RETRIES% attempts.
  echo See %LAUNCHER_LOG%
  pause
  goto :done
)

echo [%date% %time%] Restarting in %RETRY_DELAY_SEC% seconds... >> "%LAUNCHER_LOG%"
set /a PING_COUNT=%RETRY_DELAY_SEC% + 1
ping -n !PING_COUNT! 127.0.0.1 > nul
goto :cleanup_port

:done
echo [%date% %time%] Launcher exiting. >> "%LAUNCHER_LOG%"
endlocal
