# A moving colourful window of our own, sitting where the dock is, then closing itself.
# Used to measure glass while something moves behind it. Doesn't take focus or touch the mouse.
param([int]$Seconds = 30)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing @"
using System.Windows.Forms;
public class QuietForm : Form {
  protected override bool ShowWithoutActivation { get { return true; } }
  public QuietForm() { DoubleBuffered = true; }
}
"@

$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$form = New-Object QuietForm
$form.FormBorderStyle = "None"
$form.ShowInTaskbar = $false
$form.StartPosition = "Manual"
$form.Size = New-Object System.Drawing.Size([int]($screen.Width * 0.8), 340)
$form.Location = New-Object System.Drawing.Point([int]($screen.Width * 0.1), ($screen.Height - 340))

$started = Get-Date
$form.Add_Paint({
  param($s, $e)
  $t = ((Get-Date) - $started).TotalSeconds
  $w = $form.ClientSize.Width
  $h = $form.ClientSize.Height
  $bands = 7
  $colors = @("Crimson", "OrangeRed", "Gold", "LimeGreen", "DeepSkyBlue", "MediumSlateBlue", "HotPink")
  for ($i = -1; $i -le $bands; $i++) {
    $x = [int](($i / $bands * $w + $t * 180) % ($w + $w / $bands)) - [int]($w / $bands)
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromName($colors[($i + $bands) % $bands]))
    $e.Graphics.FillRectangle($brush, $x, 0, [int]($w / $bands) + 1, $h)
    $brush.Dispose()
  }
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 33
$timer.Add_Tick({
  $form.Invalidate()
  if (((Get-Date) - $started).TotalSeconds -gt $Seconds) { $form.Close() }
})
$timer.Start()
[System.Windows.Forms.Application]::Run($form)
