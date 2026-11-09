#!/bin/sh
# Runs the built dock with the debug port, drives it, quits it normally, and checks the taskbar came back.
# Warn the owner first: this hides the taskbar and opens Shelf's windows.
cd "$(dirname "$0")/../.." || exit 1
ps="powershell -NoProfile -ExecutionPolicy Bypass -File"
# The checks need the default layout, and can change these, so they step aside and come back afterwards.
data="$APPDATA/Shelf/data"
for f in layout settings dock-pins start-image; do [ -f "$data/$f.json" ] && mv "$data/$f.json" "$data/$f.json.e2e"; done
powershell -NoProfile -Command "\$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9333'; Start-Process 'src-tauri\target\release\shelf.exe'"
sleep 8
timeout 300 node src/test/cdp-check.mjs "$1" 2>&1 | cut -c1-200
"src-tauri/target/release/shelf.exe" --quit
sleep 4
if tasklist //FI "IMAGENAME eq shelf.exe" | grep -q shelf; then
  echo "FAIL --quit left Shelf running; force-killing"
  powershell -NoProfile -Command "Get-Process shelf | Sort-Object WorkingSet64 -Descending | Select-Object -First 1 | Stop-Process -Force"
  sleep 3
else
  echo "ok   --quit closed Shelf normally"
fi
$ps src/test/probe.ps1 | tail -2
for f in layout settings dock-pins start-image; do
  rm -f "$data/$f.json"
  [ -f "$data/$f.json.e2e" ] && mv "$data/$f.json.e2e" "$data/$f.json"
done
