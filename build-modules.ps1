# Builds every client module and drops the results into the client's wwwroot/modules folder.
# Client modules are found in $ModulesDir (default: modules/client): every <Name>/<Name>.csproj under it is a module.
# A module whose csproj sets <PackageId> is packed (.nupkg); every other module ships as its .dll only.
param(
    [string]$Config = "Release",
    [string]$ModulesDir = "modules/client"
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$out = "src/apps/blazor/ModularBlazor.Client/wwwroot/modules"
New-Item -ItemType Directory -Force -Path $out | Out-Null
Remove-Item "$out/*.dll", "$out/*.nupkg" -ErrorAction SilentlyContinue

$modules = Get-ChildItem $ModulesDir -Directory |
    Where-Object { Test-Path (Join-Path $_.FullName "$($_.Name).csproj") } |
    Sort-Object Name
if (-not $modules) { throw "No client modules found in $ModulesDir" }

foreach ($dir in $modules) {
    $m = $dir.Name
    $project = Join-Path $dir.FullName "$m.csproj"
    if (Select-String -Path $project -Pattern "<PackageId>" -Quiet) {
        dotnet pack $project -c $Config -o $out --nologo -v q
        if ($LASTEXITCODE -ne 0) { throw "Pack failed: $m" }
    }
    else {
        dotnet build $project -c $Config -o "artifacts/$m" --nologo -v q
        if ($LASTEXITCODE -ne 0) { throw "Build failed: $m" }
        Copy-Item "artifacts/$m/soft.square.net.$m.dll" $out
    }
}

Write-Host "Modules from $ModulesDir written to $out"
Get-ChildItem $out | Select-Object -ExpandProperty Name
