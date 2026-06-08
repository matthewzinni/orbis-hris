#!/bin/bash
# Install or update macOS cron for the Orbis weekly HR email.
# Schedule and recipients come from scripts/.env.weekly_report.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/scripts/.env.weekly_report"
RUNNER="$ROOT/scripts/run_weekly_report.sh"
MARKER="# orbis-weekly-hr-report"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

chmod +x "$RUNNER"

# Defaults: Monday 1:00 PM local (13:00)
minute=0
hour=13
dow=1

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%%#*}"
  line="$(echo "$line" | xargs)"
  [[ -z "$line" || "$line" != *=* ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  case "$key" in
    WEEKLY_REPORT_MINUTE) minute="$val" ;;
    WEEKLY_REPORT_HOUR) hour="$val" ;;
    WEEKLY_REPORT_DAY_OF_WEEK) dow="$val" ;;
  esac
done < "$ENV_FILE"

cron_line="$minute $hour * * $dow cd $ROOT && $RUNNER >> $ROOT/scripts/logs/weekly_report.log 2>&1 $MARKER"

existing="$(crontab -l 2>/dev/null || true)"
filtered="$(printf '%s\n' "$existing" | grep -v "$MARKER" | sed '/^[[:space:]]*$/d' || true)"
{
  printf '%s\n' "$filtered"
  echo "$cron_line"
} | crontab -

day_names=(Sun Mon Tue Wed Thu Fri Sat)
echo "Installed weekly Orbis report cron:"
echo "  When: ${day_names[$dow]:-?} at ${hour}:$(printf '%02d' "$minute") (local time)"
echo "  Run:  $RUNNER"
echo ""
echo "Recipients (from MAIL_TO in .env.weekly_report):"
grep -E '^MAIL_TO=' "$ENV_FILE" | head -1 || true
echo ""
echo "Logs: $ROOT/scripts/logs/weekly_report.log"
echo "To remove: crontab -e  (delete the line containing orbis-weekly-hr-report)"
