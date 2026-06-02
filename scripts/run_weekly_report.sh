#!/bin/bash
# Load scripts/.env.weekly_report and send the Orbis weekly HR email.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/scripts/.env.weekly_report"
LOG_DIR="$ROOT/scripts/logs"
LOG_FILE="$LOG_DIR/weekly_report.log"

mkdir -p "$LOG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy scripts/examples/weekly_report.env.example" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

cd "$ROOT"
/usr/bin/python3 scripts/weekly_orbis_report_email.py "$@"
