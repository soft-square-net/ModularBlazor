<#
.SYNOPSIS
  Adds an EF Core migration for every database engine to a project that ships one migration set per engine
  (a runtime module's Infrastructure project, or WebApi.Data for the tenant store).

.DESCRIPTION
  Each engine's set lives in <MigrationsDir>/<Provider> with the namespace <Namespace>.<Provider>; at runtime
  ProviderMigrationsAssembly picks the set of the engine a tenant's database runs on. dotnet-ef finds the model snapshot
  to update by file name anywhere in the project, and every set's snapshot has the same name, so while one engine's
  migration is scaffolded the other engines' snapshots are hidden (renamed to *.cs.hidden) and restored afterwards.
  The design-time factory reads the engine from "-- --provider <Provider>" (see TenantDbDesignTime).

.EXAMPLE
  ./src/WebApi/scripts/Add-Migration.ps1 -Project src/WebApi/Modules/Inventory/WebApi.Modules.Inventory.Infrastructure -Name AddReorderLevel

.EXAMPLE
  ./src/WebApi/scripts/Add-Migration.ps1 -Project src/WebApi/WebApi.Data -Context TenantStoreDbContext -Name AddPlan `
      -MigrationsDir Migrations/TenantStore -Namespace soft.square.net.WebApi.Data.TenantStore.Migrations
#>
param(
    [Parameter(Mandatory)] [string] $Project,
    [Parameter(Mandatory)] [string] $Name,
    [string] $Context,
    [string[]] $Providers = @('PostgreSql', 'SqlServer', 'MySql', 'Oracle'),
    [string] $MigrationsDir = 'Migrations',
    # Defaults to <RootNamespace>.Migrations of the project.
    [string] $Namespace
)

$ErrorActionPreference = 'Stop'
$projectDir = (Resolve-Path $Project).Path
if (Test-Path $projectDir -PathType Leaf) { $projectDir = Split-Path $projectDir }
if (-not $Namespace) {
    $root = (dotnet msbuild $projectDir -getProperty:RootNamespace).Trim()
    $Namespace = "$root.Migrations"
}

# Modules compile against the host's shared assemblies without shipping them; dotnet-ef needs them next to the
# project at design time (see WebApi.SharedKernel/SharedKernel.props).
$env:EfDesignAssets = 'all'
try {
    foreach ($provider in $Providers) {
        $setDir = Join-Path $projectDir (Join-Path $MigrationsDir $provider)
        $hidden = Get-ChildItem $projectDir -Recurse -Filter '*ModelSnapshot.cs' |
            Where-Object { $_.FullName -notmatch '[\\/](bin|obj)[\\/]' -and -not $_.DirectoryName.StartsWith($setDir, [StringComparison]::OrdinalIgnoreCase) }
        $hidden | ForEach-Object { Rename-Item $_.FullName "$($_.Name).hidden" }
        try {
            $arguments = @('ef', 'migrations', 'add', $Name, '--project', $projectDir,
                           '--output-dir', (Join-Path $MigrationsDir $provider), '--namespace', "$Namespace.$provider")
            if ($Context) { $arguments += @('--context', $Context) }
            $arguments += @('--', '--provider', $provider)
            Write-Host "== $provider" -ForegroundColor Cyan
            & dotnet @arguments
            if ($LASTEXITCODE -ne 0) { throw "dotnet ef failed for $provider" }

            # A set's first snapshot is written to a folder derived from the namespace, not to --output-dir: move it in.
            $hiddenPaths = $hidden | ForEach-Object { $_.FullName }
            $written = @(Get-ChildItem $projectDir -Recurse -Filter '*ModelSnapshot.cs' |
                Where-Object { $_.FullName -notmatch '[\\/](bin|obj)[\\/]' -and $hiddenPaths -notcontains $_.FullName -and
                               -not $_.DirectoryName.StartsWith($setDir, [StringComparison]::OrdinalIgnoreCase) })
            $written | ForEach-Object {
                    $from = $_.Directory
                    Move-Item $_.FullName (Join-Path $setDir $_.Name)
                    while ($from.FullName.Length -gt $projectDir.Length -and -not (Get-ChildItem $from.FullName -Force)) {
                        $parent = $from.Parent; Remove-Item $from.FullName; $from = $parent
                    }
                }
        }
        finally {
            $hidden | ForEach-Object { Rename-Item "$($_.FullName).hidden" $_.Name }
        }
    }
}
finally {
    Remove-Item Env:EfDesignAssets -ErrorAction SilentlyContinue
}

# Build again without the design-time assets, so the package does not ship host assemblies.
dotnet build $projectDir -v q --nologo
