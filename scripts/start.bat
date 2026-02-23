@echo off
cd /d "%~dp0"
REM 数据库与配置固定为安装目录，便于用户找到
set "DATABASE_PATH=%~dp0data.sqlite"
set PORT=3000
if exist config.json (
  for /f "delims=" %%i in ('node -e "try{const c=require('./config.json');console.log(c.port||3000)}catch(e){console.log(3000)}" 2nul') do set PORT=%%i
)
echo Starting WorkScore on port %PORT%...
echo Data file: %DATABASE_PATH%
node --experimental-sqlite dist/main.js
if errorlevel 1 pause
