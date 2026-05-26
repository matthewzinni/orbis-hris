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
| **admin** | Full HRIS including Care (edit), investigations, reports, settings |
| **supervisor** | Team roster; Care center **read-only**; no per-employee Care & Support tab |
| **user** | Read-only directory |

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local dev server |
| `npm run build` | Production bundle |
| `npm run test` | Smoke build (same as CI sanity check) |
| `npm run db:push` | Apply Supabase migrations |

## Security

Never commit `.env` or put **secret** keys in `VITE_*` variables.
