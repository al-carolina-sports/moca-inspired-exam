# Tiny local web server for the Cognitive Exam (Windows PowerShell 5.1+, no extra software).
# Serves THIS folder on http://localhost:8765/ (this computer only) and opens the Windows version in your default browser.
# If the "localhost" address cannot be registered it falls back to http://127.0.0.1:8765/.
# Close the window or press Ctrl+C to stop.
param([int]$Port = 8765, [switch]$NoBrowser, [string]$Start = 'windows/')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$mime = @{
  '.html' = 'text/html; charset=utf-8';  '.htm' = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.md'   = 'text/plain; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
  '.png'  = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'; '.webmanifest' = 'application/manifest+json'
}

# Try localhost first, then 127.0.0.1. Both count as a "secure page" for the microphone.
$listener = $null; $url = $null; $lastError = $null
foreach ($hostName in @('localhost', '127.0.0.1')) {
  $try = "http://${hostName}:$Port/"
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add($try)
  try {
    $l.Start()
    $listener = $l; $url = $try
    break
  } catch {
    $lastError = $_.Exception.Message
    try { $l.Close() } catch { }
    Write-Host "Could not use $try ($lastError). Trying the next address..." -ForegroundColor Yellow
  }
}

if ($null -eq $listener) {
  $url = "http://localhost:$Port/"
  Write-Host ""
  Write-Host "Could not start the server on port ${Port}: ${lastError}" -ForegroundColor Red
  Write-Host "It may already be running (another exam window?). Opening $url$Start anyway."
  Write-Host "If the page does not load, close other exam windows (or restart the computer) and try again."
  if (-not $NoBrowser) { Start-Process ($url + $Start) }
  exit 1
}

Write-Host ""
Write-Host "Cognitive Exam is running at $url" -ForegroundColor Green
Write-Host "  Windows version: ${url}windows/"
Write-Host "  iPad version:    ${url}ipad/   (the iPad itself should use the https:// web address instead)"
Write-Host ""
Write-Host "Leave this window open while you use the exam. Close it (or press Ctrl+C) to stop."
if (-not $NoBrowser) { Start-Process ($url + $Start) }

try {
  while ($listener.IsListening) {
    $task = $listener.GetContextAsync()
    while (-not $task.AsyncWaitHandle.WaitOne(250)) { }   # keeps Ctrl+C responsive
    $ctx = $task.GetAwaiter().GetResult()
    $res = $ctx.Response
    try {
      $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }
      $full = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
      $rootFull = [System.IO.Path]::GetFullPath($root)
      if (Test-Path -LiteralPath $full -PathType Container) { $full = Join-Path $full 'index.html' }   # /windows/ -> /windows/index.html
      if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
        $res.StatusCode = 404
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
      } else {
        $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
        $res.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' })
        $res.AddHeader('Cache-Control', 'no-store')
        $bytes = [System.IO.File]::ReadAllBytes($full)
      }
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      try { $res.StatusCode = 500 } catch { }
    } finally {
      try { $res.OutputStream.Close() } catch { }
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
