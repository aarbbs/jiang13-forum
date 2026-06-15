@echo off
REM 姜十三论坛 Windows 快捷构建（双击或命令行均可）
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" %*
exit /b %ERRORLEVEL%
