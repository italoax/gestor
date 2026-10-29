$ErrorActionPreference = 'Stop'
$monitorRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\')
$monitorRunner = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'run-hidden.vbs'))
if (-not $monitorRunner.StartsWith($monitorRoot + '\',[System.StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid monitor path.' }
$monitorHash = [System.Security.Cryptography.SHA256]::Create()
try { $monitorScope = ([BitConverter]::ToString($monitorHash.ComputeHash([Text.Encoding]::UTF8.GetBytes($monitorRoot)))).Replace('-','').Substring(0,8) } finally { $monitorHash.Dispose() }
$monitorTaskName = 'Gestor-Envios-' + $monitorScope
# A GUI host avoids the console flash that occurs before PowerShell hides itself.
$monitorHost = Join-Path $env:SystemRoot 'System32\wscript.exe'
$monitorAction = New-ScheduledTaskAction -Execute $monitorHost -Argument ('//B //NoLogo "' + $monitorRunner + '"') -WorkingDirectory $monitorRoot
$monitorTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$monitorPrincipal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$monitorSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
Register-ScheduledTask -TaskName $monitorTaskName -Action $monitorAction -Trigger $monitorTrigger -Principal $monitorPrincipal -Settings $monitorSettings -Description 'Verifica o agendador e os envios do Gestor a cada minuto, mesmo com o painel parado.' -Force | Out-Null
Start-ScheduledTask -TaskName $monitorTaskName
Write-Output ('Monitor independente instalado: ' + $monitorTaskName)
