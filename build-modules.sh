#!/usr/bin/env bash
# Builds every client module and drops the results into the client's wwwroot/modules folder.
# Client modules are found in MODULES_DIR (default: modules/client): every <Name>/<Name>.csproj under it is a module.
# A module whose csproj sets <PackageId> is packed (.nupkg); every other module ships as its .dll only.
# Usage: ./build-modules.sh [Configuration] [ModulesDir]
set -euo pipefail
cd "$(dirname "$0")"

CONFIG="${1:-Release}"
MODULES_DIR="${2:-modules/client}"
OUT="src/apps/blazor/ModularBlazor.Client/wwwroot/modules"
mkdir -p "$OUT"
rm -f "$OUT"/*.dll "$OUT"/*.nupkg

found=0
for dir in "$MODULES_DIR"/*/; do
  m="$(basename "$dir")"
  project="$dir$m.csproj"
  [ -f "$project" ] || continue
  found=1
  if grep -q "<PackageId>" "$project"; then
    dotnet pack "$project" -c "$CONFIG" -o "$OUT" --nologo -v q
  else
    dotnet build "$project" -c "$CONFIG" -o "artifacts/$m" --nologo -v q
    cp "artifacts/$m/soft.square.net.$m.dll" "$OUT/"
  fi
done
[ "$found" = 1 ] || { echo "No client modules found in $MODULES_DIR" >&2; exit 1; }

echo "Modules from $MODULES_DIR written to $OUT:"
ls -1 "$OUT"
