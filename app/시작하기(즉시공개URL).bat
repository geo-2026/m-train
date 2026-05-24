@echo off
chcp 65001 >nul
title M-TRAIN - 즉시 공개 URL (Cloudflare)
cd /d "%~dp0"
echo ============================================================
echo   M-TRAIN 즉시 공개 URL 모드 (Cloudflare Quick Tunnel)
echo   학생은 클릭 한 번으로 바로 접속 (확인창/비밀번호 없음)
echo ============================================================
if not exist node_modules (
  echo [최초 1회] 앱 구성요소를 설치합니다...
  call npm install --no-audit --no-fund
)
if not exist bin\cloudflared.exe (
  echo [최초 1회] cloudflared 다운로드 중... 약 50MB, 잠시만 기다려 주세요.
  if not exist bin mkdir bin
  powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'bin\cloudflared.exe' -UseBasicParsing } catch { Write-Host '다운로드 실패 - 인터넷 연결을 확인하세요.' }"
)
echo.
echo 서버와 공개 주소를 시작합니다. 잠시 후 화면에 https://....trycloudflare.com 주소가 나옵니다.
echo (그 주소 또는 첫 화면의 QR을 학생에게 보여주세요. 종료: 이 창에서 Ctrl + C)
echo.
node server.js --cloudflare
echo.
echo 서버가 종료되었습니다. 창을 닫으려면 아무 키나 누르세요.
pause >nul
