#!/usr/bin/env bash
# Push Northline training env vars to the orbis-demo Vercel project (production).
# Usage: ./scripts/setup_training_vercel_env.sh
# Requires: npx vercel linked to orbis-demo (npx vercel link --project orbis-demo)

set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env.training ]]; then
  echo "Missing .env.training — copy from .env.training.example and add the publishable key." >&2
  exit 1
fi

read_env() {
  local key="$1"
  local file=".env.training"
  grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"\(.*\)"$/\1/' || true
}

VITE_SUPABASE_URL="$(read_env VITE_SUPABASE_URL)"
VITE_SUPABASE_ANON_KEY="$(read_env VITE_SUPABASE_ANON_KEY)"
VITE_DEMO_INSTANCE="$(read_env VITE_DEMO_INSTANCE)"
VITE_COMPANY_NAME="$(read_env VITE_COMPANY_NAME)"
VITE_COMPANY_LEGAL_NAME="$(read_env VITE_COMPANY_LEGAL_NAME)"
VITE_COMPANY_EMAIL_DOMAIN="$(read_env VITE_COMPANY_EMAIL_DOMAIN)"
VITE_EMPLOYEE_ID_PREFIX="$(read_env VITE_EMPLOYEE_ID_PREFIX)"
VITE_ORG_WIDE_SCOPE_EMAILS="$(read_env VITE_ORG_WIDE_SCOPE_EMAILS)"
VITE_LEADERSHIP_PORTAL_EXCLUDE_EMAILS="$(read_env VITE_LEADERSHIP_PORTAL_EXCLUDE_EMAILS)"
VITE_FEATURE_JANUS="$(read_env VITE_FEATURE_JANUS)"

add_env() {
  local name="$1"
  local value="$2"
  echo "→ $name"
  npx vercel --non-interactive env add "$name" production --value "$value" --yes --force
}

TRAINING_URL="$(read_env VITE_PUBLIC_APP_URL)"
TRAINING_URL="${TRAINING_URL:-https://training.orbis-btw.com}"
add_env VITE_SUPABASE_URL "$VITE_SUPABASE_URL"
add_env VITE_SUPABASE_ANON_KEY "$VITE_SUPABASE_ANON_KEY"
add_env VITE_PUBLIC_APP_URL "$TRAINING_URL"
add_env VITE_DEMO_INSTANCE "${VITE_DEMO_INSTANCE:-true}"
add_env VITE_COMPANY_NAME "$VITE_COMPANY_NAME"
add_env VITE_COMPANY_LEGAL_NAME "$VITE_COMPANY_LEGAL_NAME"
add_env VITE_COMPANY_EMAIL_DOMAIN "$VITE_COMPANY_EMAIL_DOMAIN"
add_env VITE_EMPLOYEE_ID_PREFIX "$VITE_EMPLOYEE_ID_PREFIX"
add_env VITE_ORG_WIDE_SCOPE_EMAILS "$VITE_ORG_WIDE_SCOPE_EMAILS"
add_env VITE_LEADERSHIP_PORTAL_EXCLUDE_EMAILS "$VITE_LEADERSHIP_PORTAL_EXCLUDE_EMAILS"
add_env VITE_FEATURE_JANUS "${VITE_FEATURE_JANUS:-false}"

echo ""
echo "Done. Redeploy: npx vercel --prod"
echo "Training URL: $TRAINING_URL"
