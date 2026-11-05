# Read-only: samples the taskbar and the foreground window every 100 ms, to see what happens
# around the Start menu. Usage: start-look.ps1 [-Samples 35]
param([int]$Samples = 35)

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class S {
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rg, B; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int p);
}
"@
[void][S]::SetProcessDPIAware()
$tray = [S]::FindWindow("Shell_TrayWnd", [NullString]::Value)
$last = ""
$sw = [Diagnostics.Stopwatch]::StartNew()
for ($i = 0; $i -lt $Samples; $i++) {
  $f = [S]::GetForegroundWindow()
  $c = New-Object Text.StringBuilder 128
  [void][S]::GetClassName($f, $c, 128)
  $p = 0
  [void][S]::GetWindowThreadProcessId($f, [ref]$p)
  $name = (Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName
  $r = New-Object S+R
  [void][S]::GetWindowRect($f, [ref]$r)
  $t = New-Object S+R
  [void][S]::GetWindowRect($tray, [ref]$t)
  $line = "tray visible=$([S]::IsWindowVisible($tray)) y=$($t.T)..$($t.B) | fg $name/$c x=$($r.L)..$($r.Rg) y=$($r.T)..$($r.B)"
  if ($line -ne $last) { "{0,5}ms {1}" -f $sw.ElapsedMilliseconds, $line; $last = $line }
  Start-Sleep -Milliseconds 100
}
