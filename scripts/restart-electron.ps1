$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
npm start
