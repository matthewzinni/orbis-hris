# BTW Global Orbis

HR intelligence and operations app (Vite + TypeScript + Supabase).

## Quick start

```bash
npm install
cp .env.example .env
# Edit .env: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (Supabase → Settings → API)
npm run dev
```

## Production (Vercel)

| Variable | Value |
|----------|--------|
| `VITE_SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` (no `/rest/v1/`) |
| `VITE_SUPABASE_ANON_KEY` | Publishable / anon key |

Redeploy after changing env vars. See [DEPLOY.md](DEPLOY.md).

Live: [https://www.orbis-btw.com](https://www.orbis-btw.com)

## Database

```bash
npm run db:link   # once
npm run db:push
```

Details: [supabase/README.md](supabase/README.md)

## Scripts

Stay interview CSV import: [scripts/README.md](scripts/README.md) (service role key, local only).

## Roles

| Role | Access |
|------|--------|
| **admin** | Full HRIS — you choose who gets this in Admin & Settings |
| **supervisor** | Direct reports only — roster, attendance, leave approvals, operations (scoped) |
| **user** | **My Time Off** only — PTO tied to their login email / linked employee ID |

New staff use **Create account** on the login screen (email + password). An admin must **approve** the request and set the role. Users without an approved `user_access` row cannot use Orbis.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local dev server |
| `npm run build` | Production bundle |
| `npm run test` | Smoke build (same as CI sanity check) |
| `npm run db:push` | Apply Supabase migrations |

## Security

Never commit `.env` or put **secret** keys in `VITE_*` variables.
