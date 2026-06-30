#!/usr/bin/env bash
# Set Orbis Training Supabase Auth redirect URLs (project ydddbiqbwnuuozfcbgdo).
# Uses Supabase CLI token from macOS Keychain (supabase login).
#
# Usage: ./scripts/push_training_auth_redirects.sh

set -euo pipefail

PROJECT_REF="ydddbiqbwnuuozfcbgdo"
SITE_URL="${TRAINING_SITE_URL:-https://orbis-demo-phi.vercel.app}"
ALLOW_LIST="${TRAINING_AUTH_REDIRECT_URLS:-https://orbis-demo-phi.vercel.app/,https://training.orbis-btw.com/,http://localhost:5173/}"

TOKEN=$(security find-generic-password -s "Supabase CLI" -a "supabase" -w 2>/dev/null || true)
if [[ -z "$TOKEN" ]]; then
  echo "Run: npx supabase login" >&2
  exit 1
fi

payload=$(python3 -c "import json; print(json.dumps({'site_url': '$SITE_URL', 'uri_allow_list': '$ALLOW_LIST'}))")

curl -sS -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$payload" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('site_url:', d.get('site_url'))
print('uri_allow_list:', d.get('uri_allow_list'))
if not d.get('site_url'):
    sys.exit(1)
"
