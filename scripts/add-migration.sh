#!/usr/bin/env bash
# Adds a migration named $1 for every context in all three provider projects.
# Usage: scripts/add-migration.sh AddNotes
# Requires: dotnet tool install --global dotnet-ef
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="${1:?Usage: add-migration.sh <MigrationName>}"
STARTUP="src/api/ModularBlazor.Host"

for provider in SqlServer PostgreSql MySql; do
  project="src/migrations/$provider"
  dotnet ef migrations add "$NAME" --project "$project" --startup-project "$STARTUP" \
    --context AppDbContext --output-dir Migrations/App
  dotnet ef migrations add "$NAME" --project "$project" --startup-project "$STARTUP" \
    --context TenantStoreDbContext --output-dir Migrations/TenantStore
  # Host modules (modules/host/*): one DbContext each, kept in its own Migrations/<Module> folder.
  for module in Auth Catalog Multitenancy; do
    dotnet ef migrations add "$NAME" --project "$project" --startup-project "$STARTUP" \
      --context "${module}DbContext" --output-dir "Migrations/$module"
  done
done
