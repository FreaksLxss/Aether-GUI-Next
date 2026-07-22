@echo off
setlocal
title Aether-GUI Setup
color 0B

echo ============================================
echo    Aether-GUI - First Time Setup
echo ============================================
echo.

:: --------------------------------------------------
::  1. Check prerequisites
:: --------------------------------------------------
echo [1/4] Checking prerequisites...
echo.

:: Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo         Download it from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo   Node.js  : %NODE_VER%  [OK]

:: npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed (should come with Node.js).
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm -v') do set NPM_VER=%%i
echo   npm      : v%NPM_VER%  [OK]

:: Rust / Cargo
where cargo >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Rust/Cargo is not installed.
    echo         Install via: winget install Rustlang.Rustup
    echo         Or visit   : https://rustup.rs/
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('cargo -V') do set CARGO_VER=%%i
echo   Cargo    : %CARGO_VER%  [OK]

:: Tauri CLI (check via npx)
echo.
echo   Checking @tauri-apps/cli...
call npx --yes @tauri-apps/cli --version >nul 2>&1
if %errorlevel% neq 0 (
    echo   [WARN] Tauri CLI not found, will be used via npx.
)
echo.

:: --------------------------------------------------
::  2. Install frontend dependencies
:: --------------------------------------------------
echo [2/4] Installing frontend dependencies (npm install)...
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)
echo.
echo   Frontend dependencies installed.  [OK]
echo.

:: --------------------------------------------------
::  3. Build frontend (Vite)
:: --------------------------------------------------
echo [3/4] Building frontend (vite build)...
echo.
call npx vite build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Frontend build failed.
    pause
    exit /b 1
)
echo.
echo   Frontend build complete.  [OK]
echo.

:: --------------------------------------------------
::  4. Choose mode
:: --------------------------------------------------
echo [4/4] Setup complete! What would you like to do?
echo.
echo   [1] Start in DEV mode     (hot-reload, debug window)
echo   [2] Build for PRODUCTION  (optimized .exe in src-tauri/target/release/bundle)
echo   [3] Exit
echo.
set /p CHOICE="  Enter choice (1/2/3): "

if "%CHOICE%"=="1" goto :dev
if "%CHOICE%"=="2" goto :build
if "%CHOICE%"=="3" goto :end

echo   Invalid choice.
pause
exit /b 1

:: --------------------------------------------------
:dev
echo.
echo Starting Tauri dev server...
echo (Press Ctrl+C to stop)
echo.
call npx tauri dev
goto :end

:: --------------------------------------------------
:build
echo.
echo Building production bundle...
echo (This may take a while on first build)
echo.
call npx tauri build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Tauri build failed.
    pause
    exit /b 1
)
echo.
echo ============================================
echo    Build complete!
echo    Output: src-tauri\target\release\bundle\
echo ============================================
echo.
pause
goto :end

:: --------------------------------------------------
:end
endlocal
