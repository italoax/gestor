$ErrorActionPreference = 'Stop'
$monitorRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$monitorNode = (Get-Command node -ErrorAction Stop).Source
$monitorStart = New-Object System.Diagnostics.ProcessStartInfo
$monitorStart.FileName = $monitorNode
$monitorStart.Arguments = '--import tsx scripts/monitor/check-deliveries.mts'
$monitorStart.WorkingDirectory = $monitorRoot
$monitorStart.UseShellExecute = $false
$monitorStart.CreateNoWindow = $true
$monitorProcess = [System.Diagnostics.Process]::Start($monitorStart)
try {
    $monitorProcess.WaitForExit()
    $monitorExitCode = $monitorProcess.ExitCode
} finally {
    $monitorProcess.Dispose()
}
exit $monitorExitCode
