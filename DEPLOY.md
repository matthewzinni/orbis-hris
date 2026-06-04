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

## Employee PTO portal (self-service)

After `npm run db:push` (migration `20260608120000_employee_portal_access`):

1. **Supabase Auth** → enable **Email** provider and **Magic Link** (OTP). Add your site URL to **Redirect URLs** (e.g. `https://www.orbis-btw.com/`).
2. Ensure each employee has a **work email** on their profile (Orbis matches login email to `work_email`, `personal_email`, or `email`).
3. Optional: pre-create `user_access` rows (faster first login):

```bash
set -a && source scripts/.env.weekly_report && set +a
python scripts/provision_employee_portal_access.py --dry-run
python scripts/provision_employee_portal_access.py
```

Employees use **Email me a sign-in link** on the login page (no password). HR/supervisors still use password sign-in. **PTO requests** require approval by the employee’s **direct supervisor** (supervisor role + roster match) or **admin**.

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

## Stay interview org themes (Edge Function)

**Reports → Stay interview themes (leadership)** aggregates anonymized Q&A from recent stay interviews and calls `analyze-stay-themes` (same `OPENAI_API_KEY` secret). Use this for management readouts on what is going well, common obstacles, and retention signals.

```bash
npx supabase functions deploy analyze-stay-themes
```

If the function or secret is missing, Orbis falls back to a template rollup from the same interview data.

## Investigation AI guidance (Edge Function)

The **Generate AI guidance** button on Investigations → **AI Guidance** calls `investigation-hr-guidance` (same `OPENAI_API_KEY` secret as stay interviews).

```bash
supabase functions deploy investigation-hr-guidance
```

Apply the database migration that adds `investigations.ai_guidance` (or run `supabase db push`).

If AI is unavailable, Orbis uses a structured template that summarizes logged interview notes and prompts you to enter findings manually.

After changing the edge function prompt, redeploy:

```bash
supabase functions deploy investigation-hr-guidance
```

## Remote e-sign links (Edge Function)

Employee signing links (`/sign.html?token=...`) call `form-signature` (no Orbis login required).

```bash
npm run db:push   # creates signature_requests table
supabase functions deploy form-signature
```

HR flow: save the discipline/incident/review record → **Send signing link** (or **Request signature** in history). The link is copied to the clipboard for email/SMS.

## Attendance tracker (Intuit Workforce API)

The **Attendance** section calls Supabase Edge Function `intuit-workforce-attendance` and shows only who is **Present** vs **Absent**.

Set hosted function secrets:

```bash
supabase secrets set INTUIT_WORKFORCE_ATTENDANCE_URL=https://api.intuit.example/attendance
supabase secrets set INTUIT_WORKFORCE_API_TOKEN=your_intuit_api_token
```

Optional JSON path overrides (defaults shown):

```bash
supabase secrets set INTUIT_WORKFORCE_PRESENT_PATH=present
supabase secrets set INTUIT_WORKFORCE_ABSENT_PATH=absent
supabase secrets set INTUIT_WORKFORCE_ASOF_PATH=asOf
supabase secrets set INTUIT_WORKFORCE_TIMEZONE_PATH=timezone
```

Deploy:

```bash
supabase functions deploy intuit-workforce-attendance
```

## Smoke test (production)

1. Hard refresh or incognito → `https://www.orbis-btw.com`
2. Sign in
3. Dashboard KPIs load (not stuck on skeletons)
4. Open **Attendance** → click **Sync now** → Present/Absent populate
5. Open an employee → Stay Interviews tab
6. Care & Engagement (admin: can edit; supervisor: read-only banner, no create buttons)
7. Sign out

## Security

- [ ] `.env` not committed (`git ls-files .env` should be empty)
- [ ] Rotated any **secret** key that was pasted in chat or old commits
