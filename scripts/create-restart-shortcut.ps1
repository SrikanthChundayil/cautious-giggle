$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$targetPath = Join-Path $projectRoot 'scripts\restart-electron-hidden.vbs'
$iconPath = Join-Path $projectRoot 'assets\icons\restart-electron.ico'
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'Srikanth Suite Restart.lnk'

if (-not (Test-Path $targetPath)) {
  throw "Target script not found: $targetPath"
}

if (-not (Test-Path $iconPath)) {
  throw "Icon file not found: $iconPath"
}

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = 'Restart Electron and start Srikanth Suite'
$shortcut.Save()

Write-Output "Shortcut created at $shortcutPath"
