@echo off
title PETFLIP 99 - Auto Trade Bot
cd /d "C:\Users\pim\.gemini\antigravity\scratch\ps99-casino"

if not exist "bot\coords.json" (
  echo Missing bot\coords.json! Run "npm run bot:calibrate" first.
  pause
  exit /b 1
)

:loop
echo Starting PETFLIP 99 Trade Bot (--auto)...
node bot\trade-bot.mjs --auto
echo.
echo Bot stopped. Restarting in 5 seconds (close window or press Ctrl+C to stop)...
timeout /t 5 /nobreak >nul
goto loop
