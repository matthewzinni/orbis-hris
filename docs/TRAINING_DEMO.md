# Training / demo environment runbook

Live supervisor and employee training for Orbis uses a **separate** Supabase project and Vercel deploy. Fictional company **Northline Manufacturing** — no real BTW data, no production dumps.

**Never** run the seed script or demo env vars on BTW production (`orbis-btw.com`).

---

## Architecture

| Layer | BTW production | Training demo |
|-------|----------------|---------------|
| Supabase | BTW project | New **training** project |
| Vercel | `orbis-btw.com` | e.g. `training.orbis-btw.com` |
| Data | Real employees | Fictional `NLM####` roster only |
| Banner | Off | `VITE_DEMO_INSTANCE=true` |

Same Git repo and migration chain; isolation is by project + env vars.

---

## 1. Create the training Supabase project

```bash
cd /path/to/orbis
supabase link --project-ref YOUR_TRAINING_PROJECT_REF
npm run db:push
```

In Supabase **SQL Editor**, run (new instances only):

[`scripts/bootstrap_new_instance.sql`](../scripts/bootstrap_new_instance.sql)

This removes BTW-specific `user_access` rows from historical migrations. **Do not run on BTW production.**

---

## 2. Create demo Auth users

Orbis sign-in uses **email + password**. Create four users in the **training** Supabase project (not BTW).

### Option A — Supabase Dashboard (no script)

1. Open your **training** project → **Authentication** → **Users**.
2. Click **Add user** → **Create new user** for each row below.
3. For each user: paste the email, set a password, turn on **Auto Confirm User** (so no email verification is sent).
4. Use the **same password** for all four if you want one credential card in the training room.

| Email | Password | Role in app (after seed) | Purpose |
|-------|----------|--------------------------|---------|
| `trainer@northline-demo.local` | (your choice) | HR admin (org-wide) | Full admin walkthrough |
| `supervisor@northline-demo.local` | (same) | Supervisor (Sam Ortiz) | Production team scope |
| `lead@northline-demo.local` | (same) | Filtered admin (Dana Chen) | Fulfillment-only scope |
| `employee@northline-demo.local` | (same) | Employee portal | Self-service demo (Casey Brooks) |

**Auth settings (recommended):** **Authentication** → **Providers** → **Email** — you can leave **Enable email signups** off; admin-created users still sign in with password.

### Option B — Python script (all four at once)

```bash
pip install supabase

export SUPABASE_URL=https://YOUR_TRAINING_REF.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=sb_secret_...   # training project → Settings → API Keys → secret
export TRAINING_DEMO_PASSWORD='YourRoomPassword1!'

python3 scripts/provision_training_demo_auth_users.py
# optional: --dry-run first
```

The script skips users that already exist and refuses URLs that look like BTW production.

---

## 3. Seed fictional roster

After Auth users exist, run in Supabase **SQL Editor**:

[`scripts/seed_training_demo.sql`](../scripts/seed_training_demo.sql)

The script:

- **Aborts** if any `BTW%` employee IDs exist (production guard).
- Removes prior `NLM%` demo rows so you can re-run safely.
- Inserts ~28 employees, notes, reviews, stay interviews, leave, attendance, etc.
- Upserts `user_access` for the four demo emails (you must create Auth users first).
- Replaces `orbis_has_hr_leadership_access()` **on this database only** so `trainer@northline-demo.local` has org-wide attendance/review scope server-side.

---

## 4. Local dev against training (optional)

BTW project ref: `fxljbnyarfwnqgheywgw` — **do not use for demo.**

Training project ref: **`ydddbiqbwnuuozfcbgdo`**

```bash
cp .env.training.example .env.training
# Edit .env.training — paste publishable key from Orbis Training → Settings → API Keys

npm run dev:training
```

Sign in with a demo account (after steps 2–3 below). You should see the orange **Training demo** banner.

Your normal `npm run dev` + `.env` should stay pointed at BTW production.

---

## 5. Vercel training deploy

**Project:** `orbis-demo` (separate from BTW `orbis-hris`)

| URL | Status |
|-----|--------|
| [https://orbis-demo-phi.vercel.app](https://orbis-demo-phi.vercel.app) | Live (use now) |
| [https://training.orbis-btw.com](https://training.orbis-btw.com) | Pending DNS (see below) |

Create a new Vercel project (or preview env) pointing at the same repo. Set **Production** variables:

| Variable | Value |
|----------|--------|
| `VITE_SUPABASE_URL` | Training project URL |
| `VITE_SUPABASE_ANON_KEY` | Training anon / publishable key |
| `VITE_PUBLIC_APP_URL` | `https://training.orbis-btw.com` (or your URL) |
| `VITE_DEMO_INSTANCE` | `true` |
| `VITE_COMPANY_NAME` | `Northline Manufacturing` |
| `VITE_COMPANY_LEGAL_NAME` | `Northline Manufacturing, LLC` |
| `VITE_COMPANY_EMAIL_DOMAIN` | `northline-demo.local` |
| `VITE_EMPLOYEE_ID_PREFIX` | `NLM` |
| `VITE_ORG_WIDE_SCOPE_EMAILS` | `trainer@northline-demo.local` |
| `VITE_LEADERSHIP_PORTAL_EXCLUDE_EMAILS` | `trainer@northline-demo.local` |
| `VITE_FEATURE_JANUS` | `false` (optional — keeps CRM out of training) |

Redeploy after changing `VITE_*` values.

The orange **Training demo** banner appears only when `VITE_DEMO_INSTANCE=true`.

### Supabase Auth redirect URLs (training project)

In **Orbis Training** (`ydddbiqbwnuuozfcbgdo`) → **Authentication** → **URL configuration**, or run:

```bash
./scripts/push_training_auth_redirects.sh
```

**Site URL:** `https://orbis-demo-phi.vercel.app` (switch to `https://training.orbis-btw.com` after DNS)

**Redirect URLs:**

- `https://orbis-demo-phi.vercel.app/`
- `https://training.orbis-btw.com/`
- `http://localhost:5173/` (local `npm run dev:training`)

### Custom domain DNS (Porkbun)

`training.orbis-btw.com` is on Vercel (`orbis-demo`) but DNS still points at Porkbun parking. In Porkbun → **orbis-btw.com** → DNS:

1. **Delete** the `training` CNAME → `uixie.porkbun.com` (if present).
2. **Add** `A` record: host `training` → `76.76.21.21` (TTL 600).

Or with API keys: `./scripts/setup_training_dns_porkbun.sh`

After DNS propagates, update **Site URL** in Supabase Auth to `https://training.orbis-btw.com` and redeploy if needed.

---

## 6. Edge functions (optional)

For stay-interview AI summaries in training, deploy functions to the **training** project and set `OPENAI_API_KEY` there. See [DEPLOY.md](../DEPLOY.md).

---

## Demo scenarios (quick reference)

### HR trainer (`trainer@northline-demo.local`)

- Dashboard KPIs: at-risk (**Jordan Lee**), impact player (**Morgan Tate**), overdue review.
- Employee drawer: **Jamie Cook** (open discipline), **Alex Rivera** (incident), **Morgan Tate** (stay interview).
- HR Inbox / leave: pending request for **Jordan Lee**.
- Attendance: today’s roll call snapshot pre-seeded; edit as needed.
- Operations: open issue in Resolution Center.

### Supervisor (`supervisor@northline-demo.local` — Sam Ortiz)

- Roster scoped to Production team (`NLM100x`, `NLM110x`, `NLM400x`).
- Attendance roll call for direct reports only.
- Approve/deny leave for team members.
- Stay interview + performance review on a direct report.

### Filtered admin (`lead@northline-demo.local` — Dana Chen)

- Sees Fulfillment (`NLM200x`) only — not Production.
- Use to show “admin but not org-wide” behavior.

### Employee portal (`employee@northline-demo.local` — Casey Brooks, `NLM1002`)

- My Profile, tasks, directory (no HR admin surfaces).
- Emergency contact on file.

---

## Safety checklist

- [ ] Training Supabase project is **not** linked to BTW production ref.
- [ ] `seed_training_demo.sql` guard passed (no `BTW%` ids).
- [ ] `VITE_DEMO_INSTANCE` is **unset** on BTW Vercel production.
- [ ] No production database dump imported into training.
- [ ] Presenters use demo logins only; do not sign in as real BTW users on the training URL.

---

## Resetting demo data

Re-run `scripts/seed_training_demo.sql` on the training project. Auth users are preserved; roster and child records are replaced.

To wipe everything: create a fresh Supabase project, `db:push`, bootstrap, Auth users, seed again.
