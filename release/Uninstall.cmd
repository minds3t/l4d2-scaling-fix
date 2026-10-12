@echo off
rem Removes what Install.cmd put into the game folder.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0files\install.ps1" -Uninstall %*
echo.
pause
