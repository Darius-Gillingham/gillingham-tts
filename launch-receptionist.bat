@echo off

REM Prevent system from sleeping while plugged in
powercfg -change -standby-timeout-ac 0
powercfg -change -hibernate-timeout-ac 0

start cmd /k "cd /d %~dp0 && node whisper.js"
start cmd /k "cd /d %~dp0 && node server.js"
start cmd /k "cd /d %~dp0 && ngrok http --domain=capital-fish-formerly.ngrok-free.app 8080"
