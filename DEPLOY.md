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

## Stay interview AI summary (Edge Function)

The **Generate AI summary** button calls `summarize-stay-interview`. The OpenAI key must live in Supabase secrets (never in `VITE_*`).

```bash
# One-time: link project if needed
supabase link --project-ref YOUR_PROJECT_REF

# Set secrets on the hosted project
supabase secrets set OPENAI_API_KEY=sk-...
# Optional:
supabase secrets set OPENAI_MODEL=gpt-4o-mini

# Deploy the function
supabase functions deploy summarize-stay-interview
```

Local function testing (optional):

```bash
# supabase/.env.local — gitignored; OPENAI_API_KEY only for serve
supabase functions serve summarize-stay-interview --env-file supabase/.env.local
```

After deploy, sign in on production and use Stay Interviews → **Generate AI summary**. If the secret is missing, the app uses the structured template draft instead.

## Investigation AI guidance (Edge Function)

The **Generate AI guidance** button on Investigations → **AI Guidance** calls `investigation-hr-guidance` (same `OPENAI_API_KEY` secret as stay interviews).

```bash
supabase functions deploy investigation-hr-guidance
```

Apply the database migration that adds `investigations.ai_guidance` (or run `supabase db push`).

If AI is unavailable, Orbis uses a structured template with next steps and federal/NC checkpoint reminders.

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
