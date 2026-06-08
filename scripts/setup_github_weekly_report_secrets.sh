#!/bin/bash
# Copy weekly report secrets from scripts/.env.weekly_report into GitHub Actions secrets.
# Run once after creating the repo workflow. Requires: gh auth login

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/scripts/.env.weekly_report"

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI: brew install gh && gh auth login" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

keys=(
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  SMTP_HOST
  SMTP_PORT
  SMTP_USER
  SMTP_PASS
  MAIL_FROM
  MAIL_TO
  ORBIS_APP_URL
)

echo "Setting GitHub Actions secrets for $(gh repo view --json nameWithOwner -q .nameWithOwner)…"

for key in "${keys[@]}"; do
  value="${!key:-}"
  if [[ -z "$value" ]]; then
    echo "  skip $key (empty)" >&2
    continue
  fi
  printf '%s' "$value" | gh secret set "$key"
  echo "  set $key"
done

echo ""
echo "Done. Test with: gh workflow run weekly-orbis-report.yml"
echo "Logs: GitHub → Actions → Weekly Orbis HR Report"
