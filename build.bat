@echo off
REM Jiang13 Forum Windows build wrapper (double-click or run from cmd)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" %*
exit /b %ERRORLEVEL%
