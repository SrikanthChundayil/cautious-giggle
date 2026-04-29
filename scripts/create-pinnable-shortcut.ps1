param(
  [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'

$projectRoot = if ($ProjectRoot -and $ProjectRoot.Trim()) { $ProjectRoot } else { Split-Path -Parent $PSScriptRoot }
$projectRoot = (Resolve-Path $projectRoot).Path
$electronExe = Join-Path $projectRoot 'node_modules\electron\dist\electron.exe'
$iconPath = Join-Path $projectRoot 'assets\icons\restart-electron.ico'
$desktopPath = [Environment]::GetFolderPath('Desktop')
$programsPath = [Environment]::GetFolderPath('Programs')
$shortcutName = 'Srikanth Suite (Pin-able).lnk'
$shortcutPathDesktop = Join-Path $desktopPath $shortcutName
$shortcutPathStart = Join-Path $programsPath $shortcutName

if (-not (Test-Path (Join-Path $projectRoot 'package.json'))) {
  throw "Project root does not look valid (missing package.json): $projectRoot"
}

if (-not (Test-Path $electronExe)) {
  throw "Electron executable not found: $electronExe"
}

$wsh = New-Object -ComObject WScript.Shell
foreach ($shortcutPath in @($shortcutPathDesktop, $shortcutPathStart)) {
  $shortcut = $wsh.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $electronExe
  $shortcut.Arguments = '"' + $projectRoot + '"'
  $shortcut.WorkingDirectory = $projectRoot
  if (Test-Path $iconPath) {
    $shortcut.IconLocation = "$iconPath,0"
  }
  $shortcut.Description = "Launch Srikanth Suite from $projectRoot"
  $shortcut.Save()
}

Write-Output "Shortcut updated: $shortcutPathDesktop"
Write-Output "Shortcut updated: $shortcutPathStart"
