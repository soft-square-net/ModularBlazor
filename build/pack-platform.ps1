<#
  Packs the platform's NuGet packages: the contracts modules compile against and the Module SDK, all in one version
  (build/Platform.Packaging.props). Used by CI (.github/workflows/platform-packages.yml) and locally.

  Examples:
    ./build/pack-platform.ps1                              # 1.0.0-dev into artifacts/packages
    ./build/pack-platform.ps1 -VersionSuffix ci.42         # 1.0.0-ci.42
    ./build/pack-platform.ps1 -Version 1.2.0               # a release (CI: from the tag v1.2.0)
    ./build/pack-platform.ps1 -Output D:\feed              # into a local folder feed
#>
param(
  [string]$Output = (Join-Path $PSScriptRoot '..\artifacts\packages'),
  [string]$Version,
  [string]$VersionSuffix,
  [string]$Configuration = 'Release'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

# Order matters only for reading the log: each pack builds its own project references.
$projects = @(
  'src/Share.All/Share.All.csproj',
  'src/ModularBlazor.Abstractions/ModularBlazor.Abstractions.csproj',
  'src/WebApi/WebApi.Contracts/WebApi.Contracts.csproj',
  'src/WebApi/WebApi.SharedKernel/WebApi.SharedKernel.csproj',
  'src/WebApi/WebApi.Data/WebApi.Data.csproj',
  'src/ModularBlazor.Module.Sdk/ModularBlazor.Module.Sdk.csproj'
)

$properties = @()
if ($Version) { $properties += "-p:ModularBlazorVersion=$Version" }
elseif ($VersionSuffix) { $properties += "-p:ModularBlazorVersionSuffix=$VersionSuffix" }

New-Item -ItemType Directory -Force $Output | Out-Null
foreach ($project in $projects) {
  Write-Host "== $project"
  & dotnet pack (Join-Path $root $project) -c $Configuration -o $Output --nologo -v:minimal @properties
  if ($LASTEXITCODE -ne 0) { throw "dotnet pack failed for $project" }
}
Get-ChildItem $Output -Filter *.nupkg | Sort-Object Name | ForEach-Object { Write-Host "  $($_.Name)" }
