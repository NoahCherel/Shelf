# Measures Shelf and the WebView2 processes it owns, and nothing else on the machine.
# Usage: resources.ps1 [-Seconds 20] [-Label "idle glass"]
param([int]$Seconds = 20, [string]$Label = "sample")

$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
$children = @{}
foreach ($p in $all) {
  if (-not $children.ContainsKey([int]$p.ParentProcessId)) { $children[[int]$p.ParentProcessId] = @() }
  $children[[int]$p.ParentProcessId] += [int]$p.ProcessId
}

$roots = $all | Where-Object { $_.Name -eq "shelf.exe" } | ForEach-Object { [int]$_.ProcessId }
if (-not $roots) { "$Label : Shelf isn't running"; exit 1 }

$tree = New-Object System.Collections.Generic.HashSet[int]
$queue = New-Object System.Collections.Queue
foreach ($r in $roots) { $queue.Enqueue($r) }
while ($queue.Count) {
  $id = $queue.Dequeue()
  if ($tree.Add($id) -and $children.ContainsKey($id)) { foreach ($c in $children[$id]) { $queue.Enqueue($c) } }
}

function Sample {
  $total = 0.0; $private = 0
  foreach ($id in $tree) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($p) { $total += $p.TotalProcessorTime.TotalSeconds; $private += $p.PrivateMemorySize64 }
  }
  @{ Cpu = $total; Private = $private }
}

$cores = [Environment]::ProcessorCount
$a = Sample
$start = Get-Date
Start-Sleep -Seconds $Seconds
$b = Sample
$elapsed = ((Get-Date) - $start).TotalSeconds
$cpu = 100 * ($b.Cpu - $a.Cpu) / $elapsed / $cores
"{0} : {1:N2}% of machine ({2:N1}% of one core), {3:N0} MB private, {4} processes, {5:N0}s" -f $Label, $cpu, ($cpu * $cores), ($b.Private / 1MB), $tree.Count, $elapsed
