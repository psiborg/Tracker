@echo off
echo Starting Tracker...
start "" http://localhost:8082
python -m http.server 8082
