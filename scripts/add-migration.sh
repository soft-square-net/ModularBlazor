#!/usr/bin/env bash
# Adds a migration named $1 for both contexts in all three provider projects.
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
done
