@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe. Installe la version LTS sur https://nodejs.org puis relance ce fichier.
  start https://nodejs.org
  pause
  exit /b
)
if not exist node_modules (
  echo Premiere installation, quelques minutes...
  call npm install
  if errorlevel 1 ( echo L'installation a echoue. & pause & exit /b )
)
call npm run demo
