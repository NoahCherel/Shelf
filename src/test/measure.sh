#!/bin/sh
# Runs the built dock, measures it at rest and with motion behind it, stops it, and checks the taskbar.
# Warn the owner first: this hides the taskbar for about a minute.
cd "$(dirname "$0")/../.." || exit 1
ps="powershell -NoProfile -ExecutionPolicy Bypass -File"
powershell -NoProfile -Command "Start-Process 'src-tauri\target\release\shelf.exe'"
sleep 12
$ps src/test/probe.ps1 | sed -n 3,5p
$ps src/test/resources.ps1 -Seconds 15 -Label "at rest"
powershell -NoProfile -Command "Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','src\test\motion.ps1','-Seconds','28'"
sleep 4
$ps src/test/resources.ps1 -Seconds 20 -Label "moving "
[ -n "$1" ] && $ps src/test/probe.ps1 -Shot "$1" | tail -1
sleep 6
$ps src/test/resources.ps1 -Seconds 8 -Label "after  "
powershell -NoProfile -Command "Get-Process shelf | Sort-Object WorkingSet64 -Descending | Select-Object -First 1 | Stop-Process -Force"
sleep 3
$ps src/test/probe.ps1 | tail -2
