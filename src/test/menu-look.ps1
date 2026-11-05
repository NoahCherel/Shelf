# Reports what menu is open and what has focus, optionally saving the screen.
# -Cancel closes a menu Shelf owns, and -Esc sends the Escape key to whatever has focus.
param([string]$Shot, [switch]$Cancel, [switch]$Esc)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class L {
  [StructLayout(LayoutKind.Sequential)] public struct R { public int A, B, C, D; }
  public delegate bool Cb(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool EnumWindows(Cb c, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int p);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  public static List<string> Menus() {
    var found = new List<string>();
    EnumWindows((h, l) => {
      var c = new StringBuilder(64);
      GetClassName(h, c, 64);
      if (c.ToString() == "#32768" && IsWindowVisible(h)) { R r; GetWindowRect(h, out r); found.Add(r.A + ".." + r.C + " x " + r.B + ".." + r.D); }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
[void][L]::SetProcessDPIAware()
$f = [L]::GetForegroundWindow()
$p = 0
[void][L]::GetWindowThreadProcessId($f, [ref]$p)
"foreground: $((Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName)"
"menus open: $(([L]::Menus()) -join ' ; ')"
if ($Shot) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bmp.Save($Shot)
  $g.Dispose(); $bmp.Dispose()
}
if ($Cancel) {
  $dock = Get-Process shelf -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  [void][L]::PostMessage($dock.MainWindowHandle, 0x1F, [IntPtr]::Zero, [IntPtr]::Zero)
}
if ($Esc) { [System.Windows.Forms.SendKeys]::SendWait("{ESC}") }
