$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$electronExe = Join-Path $projectRoot 'node_modules\electron\dist\electron.exe'
$iconPath = Join-Path $projectRoot 'assets\icons\restart-electron.ico'
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'Srikanth Suite (Pin-able).lnk'

if (-not (Test-Path $electronExe)) {
  throw "Electron executable not found: $electronExe"
}

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $electronExe
$shortcut.Arguments = '"' + $projectRoot + '"'
$shortcut.WorkingDirectory = $projectRoot
if (Test-Path $iconPath) {
  $shortcut.IconLocation = "$iconPath,0"
}
$shortcut.Description = 'Launch Srikanth Suite (pin-able app shortcut)'
$shortcut.Save()

Write-Output "Shortcut created at $shortcutPath"
