@echo off
chcp 65001 >nul
title M-TRAIN - 자연과 인간의 관계 수업 앱
cd /d "%~dp0"
echo ============================================================
echo   M-TRAIN 수업 앱을 시작합니다...
echo ============================================================
if not exist node_modules (
  echo [최초 1회] 필요한 파일을 설치합니다. 잠시만 기다려 주세요...
  call npm install --no-audit --no-fund
)
node server.js
echo.
echo 서버가 종료되었습니다. 창을 닫으려면 아무 키나 누르세요.
pause >nul
