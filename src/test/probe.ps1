# Read-only look at the running dock: window rect, work area, taskbar state, optional screenshot.
# Never moves the mouse or clicks. Usage: probe.ps1 [-Shot path.png]
param([string]$Shot)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class P {
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rg, B; }
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("shell32.dll")] public static extern IntPtr SHAppBarMessage(uint m, ref ABD d);
  [StructLayout(LayoutKind.Sequential)] public struct ABD { public int cb; public IntPtr h; public uint cbm; public uint e; public R r; public IntPtr l; }
}
"@
[void][P]::SetProcessDPIAware()

$screen = [System.Windows.Forms.Screen]::PrimaryScreen
"screen    : $($screen.Bounds.Width)x$($screen.Bounds.Height)"
"work area : bottom=$($screen.WorkingArea.Bottom) height=$($screen.WorkingArea.Height)"

$proc = Get-Process shelf -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
$h = if ($proc) { $proc.MainWindowHandle } else { [IntPtr]::Zero }
if ($h -eq [IntPtr]::Zero) { "dock      : not running" } else {
  $r = New-Object P+R
  [void][P]::GetWindowRect($h, [ref]$r)
  $w = $r.Rg - $r.L
  "dock      : x=$($r.L) y=$($r.T) w=$w h=$($r.B - $r.T) visible=$([P]::IsWindowVisible($h))"
  "centre off: $(($r.L + $w / 2) - $screen.Bounds.Width / 2)"
}

$t = [P]::FindWindow("Shell_TrayWnd", [NullString]::Value)
$d = New-Object P+ABD
$d.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($d)
$d.h = $t
$state = [P]::SHAppBarMessage(4, [ref]$d).ToInt32()
"taskbar   : visible=$([P]::IsWindowVisible($t)) autohide=$(($state -band 1) -eq 1)"

$file = Join-Path $env:APPDATA "Shelf\taskbar_state.txt"
"state file: $(if (Test-Path $file) { Get-Content $file } else { 'absent' })"

if ($Shot) {
  $b = $screen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bmp.Save($Shot)
  $g.Dispose(); $bmp.Dispose()
  "screenshot: $Shot"
}
