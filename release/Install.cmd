@echo off
rem Installs the fix into the game. Options of files\install.ps1 can be added, e.g. -Resolution 1440
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0files\install.ps1" %*
echo.
pause
