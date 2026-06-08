#!/usr/bin/env bash
# Use Node 20 for Expo (avoid v21+ URL/Zod CLI bugs). Works without nvm.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE20="/opt/homebrew/opt/node@20/bin/node"
if [[ -x "$NODE20" ]]; then
  export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
fi

if ! command -v node >/dev/null; then
  echo "Node.js not found. Install Node 20: brew install node@20"
  exit 1
fi

MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$MAJOR" != "20" ]]; then
  echo "Warning: Expo works best on Node 20. Current: $(node -v)"
  echo "  brew install node@20"
  echo "  export PATH=\"/opt/homebrew/opt/node@20/bin:\$PATH\""
fi

# Kill stale Metro on 8081 so QR / connection mode is not ambiguous.
if lsof -ti :8081 >/dev/null 2>&1; then
  echo "Note: port 8081 already in use. Stop the other Expo window, or run: kill \$(lsof -ti :8081)"
fi

echo ""
echo "Orbis Mobile — open on device:"
echo "  • Same Wi‑Fi: scan QR with Expo Go (update Expo Go from App Store for SDK 56)"
echo "  • QR fails: npm run start:tunnel  (works on cellular / different networks)"
echo "  • Browser: press w in this terminal → http://localhost:8081"
echo ""

exec node --require ./scripts/expo-cli-url-fix.cjs ./node_modules/expo/bin/cli start "$@"
