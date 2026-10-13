@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo Starting Production Multi-Branch Deploy
echo ==========================================

REM 1. Puli Production
echo.
echo ==========================================
echo [1/2] Deploying puli-production
echo ==========================================
git checkout puli-production || exit /b %errorlevel%
git pull origin puli-production
git merge master --no-edit || exit /b %errorlevel%
git push origin puli-production || exit /b %errorlevel%
call bun run build || exit /b %errorlevel%

REM 2. Jinan Production
echo.
echo ==========================================
echo [2/2] Deploying jinan-production
echo ==========================================
git checkout jinan-production || exit /b %errorlevel%
git pull origin jinan-production
git merge master --no-edit || exit /b %errorlevel%
git push origin jinan-production || exit /b %errorlevel%
call bun run build || exit /b %errorlevel%

REM 3. Return to master
echo.
echo ==========================================
echo Returning to master branch
echo ==========================================
git checkout master || exit /b %errorlevel%

echo.
echo ========================================================
echo All production branches successfully deployed to FTP!
echo ========================================================
