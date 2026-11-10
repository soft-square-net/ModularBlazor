# Adds a migration to every context in all three provider projects.
# Usage: .\scripts\add-migration.ps1 AddNotes
# Requires: dotnet tool install --global dotnet-ef
param(
    [Parameter(Mandatory = $true)][string]$Name,
    # Providers to generate for (default: all). E.g. .\scripts\add-migration.ps1 Initial -Providers PostgreSql
    [string[]]$Providers = @("SqlServer", "PostgreSql", "MySql")
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$startup = "src/api/ModularBlazor.Host"
foreach ($provider in $Providers) {
    # dotnet ef takes the options from the host; this makes it build them for the provider being generated.
    $env:MIGRATIONS_PROVIDER = $provider
    $project = "src/migrations/$provider"
    dotnet ef migrations add $Name --project $project --startup-project $startup --context AppDbContext --output-dir Migrations/App
    if ($LASTEXITCODE -ne 0) { throw "$provider AppDbContext failed" }
    dotnet ef migrations add $Name --project $project --startup-project $startup --context TenantStoreDbContext --output-dir Migrations/TenantStore
    if ($LASTEXITCODE -ne 0) { throw "$provider TenantStoreDbContext failed" }
    # Host modules (modules/host/*): one DbContext each, kept in its own Migrations/<Module> folder.
    foreach ($module in "Auth", "Catalog", "Multitenancy", "Todo", "Media") {
        dotnet ef migrations add $Name --project $project --startup-project $startup --context "${module}DbContext" --output-dir "Migrations/$module"
        if ($LASTEXITCODE -ne 0) { throw "$provider ${module}DbContext failed" }
    }
}
$env:MIGRATIONS_PROVIDER = $null
