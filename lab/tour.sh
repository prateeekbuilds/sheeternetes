#!/usr/bin/env bash
#
# A guided tour of Sheeternetes. Run it once at least one kubelet is heartbeating.
#   ./lab/tour.sh
#
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
SKCTL="$here/skctl"

pause() { echo; read -rp ">> $1 (Enter to continue) "; echo; }

echo "=== Sheeternetes tour ==="
echo "Open the Google Sheet side-by-side to watch rows appear in real time."
pause "Show current nodes"
"$SKCTL" get nodes

pause "Deploy 3x whoami (lab/hello-web.json)"
"$SKCTL" apply "$here/lab/hello-web.json"
sleep 12
"$SKCTL" get pods

pause "Scale whoami to 6 and watch the scheduler place them"
"$SKCTL" scale whoami 6
sleep 12
"$SKCTL" get pods
"$SKCTL" get nodes

pause "Deploy a whole microservices city (bin-packing)"
"$SKCTL" apply "$here/lab/microservices.json"
sleep 15
"$SKCTL" get pods

pause "Self-healing: now STOP a kubelet agent in another terminal (Ctrl-C)."
echo "After ~90s its node goes NotReady and its pods reschedule elsewhere."
echo "Watch with: watch -n3 '$SKCTL get pods; echo; $SKCTL get nodes'"

pause "Clean up (delete everything)"
for d in whoami frontend api cache worker; do "$SKCTL" delete "$d" >/dev/null 2>&1 || true; done
echo "Done. The cluster is empty again."
