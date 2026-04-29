Option Explicit

Dim shell, fso, scriptDir, projectRoot, psScript
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(scriptDir)
psScript = fso.BuildPath(scriptDir, "restart-electron.ps1")

shell.CurrentDirectory = projectRoot
' 0 = hidden window, False = do not wait
shell.Run "powershell -NoProfile -ExecutionPolicy Bypass -File """ & psScript & """", 0, False
