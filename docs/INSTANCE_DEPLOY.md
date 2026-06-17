# Dedicated instance deploy runbook

Deploy Orbis as a **separate dedicated instance** per customer (own Supabase + Vercel). This is **not** multi-tenant SaaS — each customer gets an isolated database and app URL.

**BTW Global** (`orbis-btw.com`) is the primary production instance. Do not run bootstrap or customer-only env on BTW.

---

## Prerequisites

- Supabase account (new project per customer)
- Vercel account (new project per customer, or team project with separate env)
- Domain + DNS for customer (e.g. `orbis-customer.com`)
- SMTP credentials for leave notifications (optional)
- OpenAI API key for AI features (optional)

---

## 1. Supabase project

```bash
cd /path/to/orbis
supabase link --project-ref CUSTOMER_PROJECT_REF
npm run db:push
```

### Bootstrap (new instances only)

In Supabase **SQL Editor**, run:

[`scripts/bootstrap_new_instance.sql`](../scripts/bootstrap_new_instance.sql)

This removes BTW-specific `user_access` rows seeded by historical migrations. **Never run on BTW production.**

### First admin

1. Supabase → **Authentication** → **Users** → create admin email + password
2. Run the `insert into public.user_access` block at the bottom of `bootstrap_new_instance.sql` (replace placeholders)
3. Supabase → **Authentication** → **URL configuration** → add customer app URL

### Edge functions

Deploy all functions to the customer project:

```bash
npx supabase functions deploy summarize-stay-interview
npx supabase functions deploy analyze-stay-themes
npx supabase functions deploy summarize-janus-meeting
npx supabase functions deploy investigation-hr-guidance
npx supabase functions deploy form-signature
npx supabase functions deploy notify-leave-request
npx supabase functions deploy intuit-workforce-attendance
```

Set secrets (see [DEPLOY.md](../DEPLOY.md)):

```bash
npx supabase secrets set OPENAI_API_KEY=sk-...
npx supabase secrets set SMTP_HOST=...
# etc.
```

---

## 2. Vercel project

Connect the same `orbis-hris` GitHub repo. Set **Production** environment variables:

| Variable | Required | Example (BTW default) |
|----------|----------|-------------------------|
| `VITE_SUPABASE_URL` | Yes | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Yes | publishable / anon key |
| `VITE_PUBLIC_APP_URL` | Yes | `https://www.orbis-customer.com` |
| `VITE_COMPANY_NAME` | Optional | `Acme Manufacturing` |
| `VITE_COMPANY_LEGAL_NAME` | Optional | `Acme Manufacturing, LLC` |
| `VITE_COMPANY_EMAIL_DOMAIN` | Optional | `acme.com` |
| `VITE_EMPLOYEE_ID_PREFIX` | Optional | `ACME` |
| `VITE_ORG_WIDE_SCOPE_EMAILS` | Optional | `hr@acme.com,ceo@acme.com` |
| `VITE_FEATURE_JANUS` | Optional | `false` (HR-only customers) |
| `VITE_FEATURE_INVESTIGATIONS` | Optional | `true` |

Omit optional vars to keep BTW defaults (safe for BTW; wrong for other companies).

Redeploy after env changes. See [`.env.example`](../.env.example) for full list.

Config resolution: [`src/config/instanceConfig.ts`](../src/config/instanceConfig.ts) (BTW defaults when unset).

---

## 3. Customer data import

1. Import employees (CSV/scripts or manual entry)
2. Set `user_access` rows for supervisors (role, `supervisor_name`, `supervised_employee_ids`)
3. Import PTO baselines if using Time Off (`scripts/import_pto_balances.py`)
4. Optional: Copper → Janus import if `VITE_FEATURE_JANUS=true`

---

## 4. Smoke test

1. Sign in as customer admin
2. Dashboard KPIs load
3. Create/open employee → save
4. Supervisor login → sees direct reports only (Attendance, reviews)
5. Employee portal signup → pending approval flow
6. E-sign link uses `VITE_PUBLIC_APP_URL` (`/sign.html?token=...`)

---

## 5. BTW-specific migrations (awareness)

Several migrations in `supabase/migrations/` are tagged:

- `-- btw-instance-seed` — inserts/updates BTW production data; bootstrap script reverses on new instances
- `-- btw-instance-config` — SQL functions with BTW leadership emails; client env overrides partially; SQL settings table planned Month 2

Do **not** remove these from the chain — BTW production depends on them.

---

## 6. Operations per instance

| Task | BTW | Customer B |
|------|-----|--------------|
| Backups | Supabase dashboard / PITR | Same, separate project |
| Weekly HR email | GitHub Action + secrets | Separate workflow or disable |
| Support | Internal | Customer admin contact |
| Upgrades | `git pull` + `db:push` + Vercel deploy | Same codebase, their schedule |

---

## Related docs

- [DEPLOY.md](../DEPLOY.md) — edge functions, SMTP, smoke test details
- [scripts/README.md](../scripts/README.md) — import scripts
- [MIGRATION.md](../MIGRATION.md) — schema workflow
