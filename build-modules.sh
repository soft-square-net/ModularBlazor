#!/usr/bin/env bash
# Builds every module and drops the results into the client's wwwroot/modules folder.
# .dll modules: copy the module assembly only. .nupkg modules: dotnet pack.
set -euo pipefail
cd "$(dirname "$0")"

CONFIG="${1:-Release}"
OUT="src/ModularBlazor.Client/wwwroot/modules"
mkdir -p "$OUT"
rm -f "$OUT"/*.dll "$OUT"/*.nupkg

DLL_MODULES=(Layouts.Default Layouts.Admin Module.Auth Module.Dashboard Module.Admin)
for m in "${DLL_MODULES[@]}"; do
  dotnet build "modules/client/$m/$m.csproj" -c "$CONFIG" -o "artifacts/$m" --nologo -v q
  cp "artifacts/$m/$m.dll" "$OUT/"
done

NUPKG_MODULES=(Module.Reports)
for m in "${NUPKG_MODULES[@]}"; do
  dotnet pack "modules/client/$m/$m.csproj" -c "$CONFIG" -o "$OUT" --nologo -v q
done

echo "Modules written to $OUT:"
ls -1 "$OUT"
