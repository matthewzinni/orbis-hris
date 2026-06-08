# Orbis Mobile (Phase 0 — admin only)

Expo app for **admin** users to browse the full employee roster on phone. Uses the same Supabase project and credentials as the web HRIS.

## Phase 0 includes

- Sign in (admin role only; supervisors are turned away with a clear message)
- Searchable employee list (active-only filter)
- Read-only employee detail
- Sign out

## Setup

**Use Node 20 only.** Node 21+ breaks Expo CLI (`URL is not a constructor`).

### One-time: install Node 20 (no nvm required)

```bash
brew install node@20
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
node -v   # must show v20.x.x (not v21 or v24)
```

Add that `export PATH=...` line to `~/.zshrc` so new terminals keep Node 20.

### Run the app

```bash
cd mobile
npm install
cp .env.example .env
# Edit .env — same EXPO_PUBLIC_* values as VITE_* in the repo root .env
npm start
```

`npm start` uses `scripts/start.sh`, which picks Homebrew Node 20 when installed.

Then press **`w`** for web, scan the QR code with **Expo Go**, or press **`i`** for iOS simulator (requires Xcode).

### QR code doesn’t work?

1. **Update Expo Go** on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)) — this project uses **Expo SDK 56**; an old Expo Go will refuse the link.
2. **Same Wi‑Fi** — phone and Mac must be on the same network (not guest Wi‑Fi). Turn off VPN on both if possible.
3. **Use tunnel mode** (most reliable):
   ```bash
   npm run start:tunnel
   ```
   Wait until it says tunnel ready, then scan the new QR code.
4. **Manual connect in Expo Go** — tap “Enter URL manually” and paste the `exp://…` URL from the terminal (must **not** be `localhost`; it should look like `exp://192.168.x.x:8081` or an `*.exp.direct` tunnel URL).
5. **Only one dev server** — if you see “port 8081 is running in another window”, stop the old one:
   ```bash
   kill $(lsof -ti :8081)
   npm start
   ```
6. **iPhone** — use the **Camera** app or **Expo Go’s built-in scanner**, not a random QR app.
7. **Still stuck?** Press **`w`** in the terminal and use the app in the browser at `http://localhost:8081`.

### Still seeing `URL is not a constructor`?

1. `node -v` → must be **v20.x**, not v21/v24.
2. Run **`npm start`** (not `expo start` directly).
3. Reinstall deps after pulling latest: `rm -rf node_modules && npm install`

## Environment

| Variable | Source |
|----------|--------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Publishable / anon key (not the secret key) |

Restart `npm start` after changing `.env`.

## Next phases

- Supervisor-scoped roster
- Attendance roll call
- Limited edits and operations from mobile

Web app remains the system of record for heavy HR workflows: [orbis-btw.com](https://www.orbis-btw.com).
