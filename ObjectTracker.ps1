# Desktop launcher: one backend process serving the built UI, opened in a
# Chrome app window (no tabs, no address bar, close with the X top-right).
# Closing that window stops everything this launcher started.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
# 8010, not 8000: QuantPa's backend also uses 8000, and both apps can be
# open at once.
$port = 8010
# 127.0.0.1, never "localhost": that resolves to ::1 first here and the connect
# hangs rather than refusing, so every readiness probe timed out.
$url = "http://127.0.0.1:$port"
$log = Join-Path $env:TEMP 'object-tracker.log'
$profileDir = "$env:LOCALAPPDATA\ObjectTracker\chrome"
$api = $null

function Write-Log($msg) {
  "{0:HH:mm:ss}  {1}" -f (Get-Date), $msg | Add-Content -Path $log -Encoding utf8
}

function Stop-Ours {
  # Kills only what this launcher starts: a uvicorn serving main:app, and any
  # Chrome on our own profile dir. Someone else's server on the port is left
  # alone -- that case is reported instead.
  foreach ($proc in @(Get-CimInstance Win32_Process -Filter "Name='python.exe'")) {
    if ($proc.CommandLine -like '*uvicorn*' -and $proc.CommandLine -like '*main:app*') {
      # /T because uvicorn's worker child would otherwise keep holding the port.
      Start-Process taskkill -ArgumentList '/PID', $proc.ProcessId, '/T', '/F' `
        -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue
      Write-Log "killed server pid=$($proc.ProcessId)"
    }
  }
  foreach ($proc in @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'")) {
    if ($proc.CommandLine -like "*$profileDir*") {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
      Write-Log "killed window pid=$($proc.ProcessId)"
    }
  }
}

$script:probeLogged = $false
function Test-Api {
  # /models only answers from this app, so a stray server on the same port
  # can't be mistaken for ours.
  try { (Invoke-WebRequest "$url/models" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 }
  catch {
    # First failure only -- the rest are the same while the server boots.
    if (-not $script:probeLogged) { $script:probeLogged = $true; Write-Log "probe failed: $_" }
    $false
  }
}

try {
  Set-Content -Path $log -Value '' -Encoding utf8
  Write-Log "start, root=$root"

  $chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $chrome) { throw "Chrome not found. Install Chrome, or open $url in any browser." }

  # First run (or after a frontend change) needs a build; the server serves dist/.
  if (-not (Test-Path "$root\frontend\dist\index.html")) {
    Write-Log 'building frontend'
    Start-Process npm.cmd -ArgumentList 'run', 'build' -WorkingDirectory "$root\frontend" -Wait -WindowStyle Hidden
  }

  # Whatever a previous run left behind dies here, so launch #2 is never blocked
  # by launch #1's leftovers.
  Stop-Ours
  $busy = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  if ($busy) { throw "Port $port is taken by another program (PID $($busy[0].OwningProcess)). Close it and try again." }

  $api = Start-Process python -ArgumentList '-m', 'uvicorn', 'main:app', '--port', $port `
    -WorkingDirectory "$root\backend" -WindowStyle Hidden -PassThru
  Write-Log "uvicorn pid=$($api.Id)"

  # Loading the model libraries takes a while on a cold start.
  $ready = $false
  foreach ($i in 1..120) {
    if ($api.HasExited) { throw "Server stopped on startup (exit $($api.ExitCode)). Run 'python -m uvicorn main:app --port $port' in backend\ to see why." }
    if (Test-Api) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "Server did not answer on $url after 60s." }
  Write-Log 'server ready'

  # Its own profile dir keeps this window out of any running Chrome session, so
  # -Wait really waits. The first-run flags matter: without them a brand new
  # profile opens Chrome's welcome screen instead of the app window.
  Start-Process $chrome -Wait -ArgumentList @(
    "--app=$url",
    # Maximized, not --start-fullscreen: keeps the window frame and its X.
    '--start-maximized',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=ChromeWhatsNewUI',
    "--user-data-dir=$profileDir"
  )
  Write-Log 'window closed'
}
catch {
  Write-Log "ERROR: $_"
  # The shortcut runs hidden, so without this a failure looks like nothing happened.
  [void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')
  [System.Windows.Forms.MessageBox]::Show("$_`n`nLog: $log", 'Object Tracker', 'OK', 'Error')
}
finally {
  Stop-Ours
  Write-Log 'stopped'
}
