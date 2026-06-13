@echo off
rem SimRefinery 3D — local server + browser
cd /d "%~dp0"
start "" http://localhost:8917/
echo SimRefinery running at http://localhost:8917/  (close this window to stop)
python -m http.server 8917
