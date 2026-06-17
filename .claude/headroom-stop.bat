@echo off
REM Purpose: cleanly stop the HEADROOM proxy launched by headroom-start.bat
REM Setup: finds and kills the headroom.exe process listening on port 8787
REM Issues: none
REM Fix: created to match headroom-start.bat
REM Gotchas: killing the wrong process if another service uses port 8787
setlocal EnableDelayedExpansion
set HEADROOM_PORT=8787

echo Stopping HEADROOM proxy on port %HEADROOM_PORT%...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%HEADROOM_PORT%" ^| findstr "LISTENING"') do (
  taskkill /PID %%a /F > nul 2>&1
  if !ERRORLEVEL! equ 0 (
    echo Stopped process %%a.
  ) else (
    echo Could not stop process %%a.
  )
)

endlocal
