# Orbis deploy checklist

Use after changing env vars, migrations, or auth-related code.

## Vercel environment

- [ ] `VITE_SUPABASE_URL` = `https://YOUR_PROJECT.supabase.co` (no `/rest/v1/`)
- [ ] `VITE_SUPABASE_ANON_KEY` = publishable / anon key only (not `sb_secret_…`)
- [ ] Variables enabled for **Production** (and **Preview** if you use preview URLs)
- [ ] **Redeploy** (uncheck build cache if login still shows old errors)

## Database

```bash
npm run db:push
npm run db:status
```

## Smoke test (production)

1. Hard refresh or incognito → `https://www.orbis-btw.com`
2. Sign in
3. Dashboard KPIs load (not stuck on skeletons)
4. Open an employee → Stay Interviews tab
5. Care & Engagement (admin: can edit; supervisor: read-only banner, no create buttons)
6. Sign out

## Security

- [ ] `.env` not committed (`git ls-files .env` should be empty)
- [ ] Rotated any **secret** key that was pasted in chat or old commits
