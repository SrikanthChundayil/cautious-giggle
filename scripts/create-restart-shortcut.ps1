param(
  [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'

$projectRoot = if ($ProjectRoot -and $ProjectRoot.Trim()) { $ProjectRoot } else { Split-Path -Parent $PSScriptRoot }
$projectRoot = (Resolve-Path $projectRoot).Path
$targetPath = Join-Path $projectRoot 'scripts\restart-electron-hidden.vbs'
$iconPath = Join-Path $projectRoot 'assets\icons\restart-electron.ico'
$desktopPath = [Environment]::GetFolderPath('Desktop')
$programsPath = [Environment]::GetFolderPath('Programs')
$shortcutName = 'Srikanth Suite Restart.lnk'
$shortcutPathDesktop = Join-Path $desktopPath $shortcutName
$shortcutPathStart = Join-Path $programsPath $shortcutName

if (-not (Test-Path (Join-Path $projectRoot 'package.json'))) {
  throw "Project root does not look valid (missing package.json): $projectRoot"
}

if (-not (Test-Path $targetPath)) {
  throw "Target script not found: $targetPath"
}

if (-not (Test-Path $iconPath)) {
  throw "Icon file not found: $iconPath"
}

$wsh = New-Object -ComObject WScript.Shell
foreach ($shortcutPath in @($shortcutPathDesktop, $shortcutPathStart)) {
  $shortcut = $wsh.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $targetPath
  $shortcut.WorkingDirectory = $projectRoot
  $shortcut.IconLocation = "$iconPath,0"
  $shortcut.Description = "Restart Electron and start Srikanth Suite from $projectRoot"
  $shortcut.Save()
}

Write-Output "Shortcut updated: $shortcutPathDesktop"
Write-Output "Shortcut updated: $shortcutPathStart"
