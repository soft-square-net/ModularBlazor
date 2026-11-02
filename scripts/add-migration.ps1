# Adds a migration to every context in all three provider projects.
# Usage: .\scripts\add-migration.ps1 AddNotes
# Requires: dotnet tool install --global dotnet-ef
param([Parameter(Mandatory = $true)][string]$Name)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$startup = "src/api/ModularBlazor.Host"
foreach ($provider in "SqlServer", "PostgreSql", "MySql") {
    $project = "src/migrations/$provider"
    dotnet ef migrations add $Name --project $project --startup-project $startup --context AppDbContext --output-dir Migrations/App
    if ($LASTEXITCODE -ne 0) { throw "$provider AppDbContext failed" }
    dotnet ef migrations add $Name --project $project --startup-project $startup --context TenantStoreDbContext --output-dir Migrations/TenantStore
    if ($LASTEXITCODE -ne 0) { throw "$provider TenantStoreDbContext failed" }
    # Host modules (modules/host/*): one DbContext each, kept in its own Migrations/<Module> folder.
    foreach ($module in "Auth", "Catalog") {
        dotnet ef migrations add $Name --project $project --startup-project $startup --context "${module}DbContext" --output-dir "Migrations/$module"
        if ($LASTEXITCODE -ne 0) { throw "$provider ${module}DbContext failed" }
    }
}
