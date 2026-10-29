Option Explicit
Dim monitorShell, monitorFiles, monitorRunner, monitorPowerShell, monitorCommand, monitorExitCode
Set monitorShell = CreateObject("WScript.Shell")
Set monitorFiles = CreateObject("Scripting.FileSystemObject")
monitorRunner = monitorFiles.BuildPath(monitorFiles.GetParentFolderName(WScript.ScriptFullName), "run-hidden.ps1")
monitorPowerShell = monitorShell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")
monitorCommand = Chr(34) & monitorPowerShell & Chr(34) & " -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Chr(34) & monitorRunner & Chr(34)
' Hide the child from creation and wait so Task Scheduler tracks completion and exit status.
monitorExitCode = monitorShell.Run(monitorCommand, 0, True)
WScript.Quit monitorExitCode
