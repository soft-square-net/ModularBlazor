# Supervisor for the host API: builds it, runs it, and when the app stopped because a restart was requested
# (POST /api/v1/modules/restart leaves assets/modules/restart.requested) rebuilds with the host modules enabled in
# the module store and runs it again. Any other exit ends the loop.
# Usage: .\scripts\run-host.ps1
param([string[]]$RunArgs = @())
Set-Location (Join-Path $PSScriptRoot "..")
$project = "src/api/ModularBlazor.Host"
$marker = Join-Path $project "assets/modules/restart.requested"

while ($true) {
    Write-Host "[run-host] building..."
    dotnet build $project
    if ($LASTEXITCODE -ne 0) {
        Read-Host "[run-host] build failed; fix it or disable the module, then press Enter to retry (Ctrl+C to quit)"
        continue
    }
    Push-Location $project
    dotnet run --no-build @RunArgs
    Pop-Location
    if (Test-Path $marker) {
        Remove-Item $marker -Force
        Write-Host "[run-host] restart requested: rebuilding with the enabled host modules"
        continue
    }
    break
}
