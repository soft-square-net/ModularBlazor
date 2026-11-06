# Builds every module and drops the results into the client's wwwroot/modules folder.
param([string]$Config = "Release")
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$out = "src/apps/blazor/ModularBlazor.Client/wwwroot/modules"
New-Item -ItemType Directory -Force -Path $out | Out-Null
Remove-Item "$out/*.dll", "$out/*.nupkg" -ErrorAction SilentlyContinue
# TODO Load the modules name from the Directory into $dllModules variable
$dllModules = "Layouts.Default", "Layouts.Admin", "Module.Auth", "Module.Dashboard", "Module.Admin"
foreach ($m in $dllModules) {
    dotnet build "modules/client/$m/$m.csproj" -c $Config -o "artifacts/$m" --nologo -v q
    if ($LASTEXITCODE -ne 0) { throw "Build failed: $m" }
    Copy-Item "artifacts/$m/soft.square.net.$m.dll" $out
}

$nupkgModules = "Module.Reports"
foreach ($m in $nupkgModules) {
    dotnet pack "modules/client/$m/$m.csproj" -c $Config -o $out --nologo -v q
    if ($LASTEXITCODE -ne 0) { throw "Pack failed: $m" }
}

Write-Host "Modules written to $out"
Get-ChildItem $out | Select-Object -ExpandProperty Name
