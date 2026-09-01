#!/usr/bin/env bash
#
# SheetHub -> Sheetlux CD GitOps Sync Bridge
#
# Pulls declarative manifests from the SheetHub `Files` tab into a local directory
# (e.g. ./gitops) for Sheetlux CD to apply and reconcile into the Sheeternetes cluster.
#
# Usage:
#   ./sheethub/sheetlux-sync.sh [repo] [target_dir]
#   ./sheethub/sheetlux-sync.sh sncf/hello-web ./gitops
#
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
REPO="${1:-sncf/hello-web}"
DIR="${2:-$root/gitops}"
SHCTL="$root/shctl"

mkdir -p "$DIR"

echo "[sheetlux-sync] Fetching manifests from SheetHub repo: $REPO..."
files_json="$("$SHCTL" get files "$REPO" 2>/dev/null || true)"

# Get app.json from SheetHub
manifest="$("$SHCTL" file get "$REPO" app.json 2>/dev/null || true)"

if [ -n "$manifest" ] && [ "$manifest" != "null" ]; then
  echo "$manifest" > "$DIR/app.json"
  echo "[sheetlux-sync] Synced app.json from SheetHub -> $DIR/app.json"
  echo "[sheetlux-sync] Ready for Sheetlux CD to reconcile into Sheeternetes."
else
  echo "[sheetlux-sync] No app.json manifest found in SheetHub repo $REPO."
fi
