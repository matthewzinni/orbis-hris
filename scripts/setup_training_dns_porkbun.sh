#!/usr/bin/env bash
# Point training.orbis-btw.com at Vercel (orbis-demo).
#
# Requires Porkbun API keys: https://porkbun.com/account/api
#   export PORKBUN_API_KEY=pk1_...
#   export PORKBUN_SECRET_API_KEY=sk1_...
#
# Usage: ./scripts/setup_training_dns_porkbun.sh

set -euo pipefail

DOMAIN="orbis-btw.com"
HOST="training"
VERCEL_A="76.76.21.21"

if [[ -z "${PORKBUN_API_KEY:-}" || -z "${PORKBUN_SECRET_API_KEY:-}" ]]; then
  echo "Set PORKBUN_API_KEY and PORKBUN_SECRET_API_KEY first." >&2
  exit 1
fi

api() {
  local payload="$1"
  curl -sS -X POST "https://api.porkbun.com/api/json/v3/${2}" \
    -H "Content-Type: application/json" \
    -d "{\"apikey\":\"${PORKBUN_API_KEY}\",\"secretapikey\":\"${PORKBUN_SECRET_API_KEY}\",${payload}}"
}

echo "→ Listing existing ${HOST}.${DOMAIN} records…"
records=$(api "\"domain\":\"${DOMAIN}\"" "dns/retrieve/${DOMAIN}")
echo "$records" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if data.get('status') != 'SUCCESS':
    print('retrieve failed:', data, file=sys.stderr)
    sys.exit(1)
for row in data.get('records', []):
    if row.get('name', '').rstrip('.') in ('${HOST}', '${HOST}.${DOMAIN}'):
        print(row.get('id'), row.get('type'), row.get('name'), row.get('content'))
"

echo "→ Removing Porkbun parking CNAME (if present)…"
echo "$records" | python3 -c "
import json, sys, os, subprocess
data = json.load(sys.stdin)
for row in data.get('records', []):
    name = row.get('name', '').rstrip('.')
    if name in ('${HOST}', '${HOST}.${DOMAIN}') and row.get('id'):
        rid = row['id']
        print('delete', rid, row.get('type'), row.get('content'))
        subprocess.run([
            'curl', '-sS', '-X', 'POST',
            f'https://api.porkbun.com/api/json/v3/dns/delete/${DOMAIN}/{rid}',
            '-H', 'Content-Type: application/json',
            '-d', json.dumps({
                'apikey': os.environ['PORKBUN_API_KEY'],
                'secretapikey': os.environ['PORKBUN_SECRET_API_KEY'],
            }),
        ], check=True)
"

echo "→ Creating A ${HOST}.${DOMAIN} → ${VERCEL_A}…"
create=$(api "\"domain\":\"${DOMAIN}\",\"type\":\"A\",\"name\":\"${HOST}\",\"content\":\"${VERCEL_A}\",\"ttl\":600" "dns/create/${DOMAIN}")
echo "$create"
echo "$create" | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get('status')=='SUCCESS' else 1)"

echo ""
echo "Done. Verify: dig +short ${HOST}.${DOMAIN} A"
echo "Vercel may take a few minutes to issue SSL for https://${HOST}.${DOMAIN}"
