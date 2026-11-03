#!/usr/bin/env bash
# Supervisor for the host API: builds it, runs it, and when the app stopped because a restart was requested
# (POST /api/v1/modules/restart leaves modules-store/restart.requested) rebuilds with the host modules enabled in
# the module store and runs it again. Any other exit ends the loop.
# Usage: scripts/run-host.sh [extra dotnet run args]
set -uo pipefail
cd "$(dirname "$0")/.."
PROJECT="src/api/ModularBlazor.Host"
MARKER="$PROJECT/modules-store/restart.requested"

while true; do
  echo "[run-host] building..."
  dotnet build "$PROJECT" || { echo "[run-host] build failed; fix it or disable the module, then press Enter to retry (Ctrl+C to quit)"; read -r; continue; }
  (cd "$PROJECT" && dotnet run --no-build "$@")
  if [ -f "$MARKER" ]; then
    rm -f "$MARKER"
    echo "[run-host] restart requested: rebuilding with the enabled host modules"
    continue
  fi
  break
done
