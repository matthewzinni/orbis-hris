# Orbis deploy checklist

Use after changing env vars, migrations, or auth-related code.

**Dedicated instance (second customer):** see [docs/INSTANCE_DEPLOY.md](docs/INSTANCE_DEPLOY.md).

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

## Account registration & approval

After `npm run db:push` (migration `20260611120000_account_registration_approval`):

1. **Supabase Auth** → **Sign In / Providers** → **Email**:
   - **Enable Email provider**
   - **Allow new users to sign up** → **ON** (users self-register from the Orbis login screen)
   - Optional: disable **Confirm email** for faster internal rollout (otherwise users confirm email before admin approval)
2. **Authentication** → **URL configuration** → add:
   - `https://www.orbis-btw.com/`
   - `https://orbis-btw.com/`
   - `http://localhost:5173/` (local dev)

### Flow

1. User clicks **Create account** → email + password.
2. Orbis creates a **pending** `user_access` row (`orbis_register_account_request`).
3. Admin opens **Admin & Settings** → **Pending account requests** → **Review & approve**.
4. Admin sets role:
   - **user** — PTO portal only (`linked_employee_id` should match roster email, e.g. `BTW2105`)
   - **supervisor** — direct reports (`supervised_employee_ids` or supervisor name match)
   - **admin** — full HRIS
5. User signs in with password after approval.

**PTO requests** require approval by the employee’s **direct supervisor** or **admin**.

## Time off email notifications (Edge Function)

When an employee submits PTO, Orbis calls `notify-leave-request`. It emails leadership admins and the employee’s **supervisor** (from roster + `user_access`).

Set the same SMTP credentials you use for the weekly HR report:

```bash
supabase secrets set SMTP_HOST=smtp.gmail.com
supabase secrets set SMTP_PORT=587
supabase secrets set SMTP_USER=your-hr-mailbox@btwglobal.com
supabase secrets set SMTP_PASS=your-google-app-password
supabase secrets set MAIL_FROM=your-hr-mailbox@btwglobal.com
# Optional extra recipients (comma-separated)
supabase secrets set NOTIFY_LEAVE_EXTRA_EMAILS=

supabase functions deploy notify-leave-request
```

If SMTP secrets are missing, requests still save and appear in **HR Inbox** — email is skipped.

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

After deploy, sign in on production and use Stay Interviews → **Generate AI summary**. Summaries are interpretive (what matters, risks, opportunities, recommended focus) — not data recaps. If the secret is missing, the app uses a structured advisory template instead.

## Janus meeting AI summary (Edge Function)

Janus **Generate summary** on the Meetings tab calls `summarize-janus-meeting` (same `OPENAI_API_KEY` secret as stay interviews).

```bash
supabase functions deploy summarize-janus-meeting
```

If the function is not deployed or `OPENAI_API_KEY` is unset, Janus falls back to a basic summary draft from the pasted transcript.

## Stay interview org themes (Edge Function)

**Reports → Stay interview themes (leadership)** aggregates Q&A from recent stay interviews (with employee names for theme attribution) and calls `analyze-stay-themes` (same `OPENAI_API_KEY` secret). Use this for management readouts on what is going well, common obstacles, retention signals, and who to follow up with.

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

Employee signing links (`/sign.html?token=...`) call `form-signature` (no Orbis login required). Do **not** send employees to the main app URL (`/?signToken=...`) — that requires an Orbis login.

If Vercel **Deployment Protection** is enabled on preview deployments, add a path exception for `/sign.html` in Project → Settings → Deployment Protection, or send links using production `https://www.orbis-btw.com/sign.html?token=...` only.

Set `VITE_PUBLIC_APP_URL=https://www.orbis-btw.com` in Vercel Production so copied signing links always use the public site (not a preview URL).

```bash
npm run db:push   # creates signature_requests table
supabase functions deploy form-signature
```

HR flow: save the discipline/incident/review record → **Copy signing link** (or from history). The link is copied to the clipboard for email/SMS. Employee opens `/sign.html?token=...` — no Orbis login required.

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

## Monday time-off email (QuickBooks Time / TSheets)

Every Monday at 7:00 AM Eastern, GitHub Actions runs `scripts/weekly_time_off_email.py`
(`.github/workflows/weekly-time-off-email.yml`). It reads this week's time off request entries
from QuickBooks Time and emails leadership (Orbis leadership list + approved Orbis admins +
`TIME_OFF_EXTRA_EMAILS`) two lists: approved time off and requests still pending.

It reuses the weekly HR report secrets (`SUPABASE_*`, `SMTP_*`, `MAIL_FROM`) and adds:

- `QBT_ACCESS_TOKEN` — QuickBooks Time → Feature Add-ons → **API** → Add a new application/token.
  Copy the access token into `scripts/.env.weekly_report` as `QBT_ACCESS_TOKEN=...` (never paste it in chat).
- `TIME_OFF_EXTRA_EMAILS` — optional, comma-separated (e.g. David).

```bash
python3 scripts/weekly_time_off_email.py --dry-run      # preview locally
bash scripts/setup_github_weekly_report_secrets.sh       # copies the new secrets to GitHub
gh workflow run weekly-time-off-email.yml                # send a test now
```

### "Send now" button in Orbis (Reports → Time off this week)

Admins can send the same report on demand — to leadership or just to themselves as a preview —
from **Reports → Time off this week**. The button calls the `send-time-off-report` Edge Function,
which needs the token and email settings as Supabase secrets:

```bash
npx supabase secrets set QBT_ACCESS_TOKEN=...            # same token as GitHub
npx supabase secrets set TIME_OFF_EXTRA_EMAILS=david.allewalt@btwglobal.com
# SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_FROM — already set if leave-request emails work
npx supabase functions deploy send-time-off-report
```

## PTO balances from QuickBooks Time (daily sync)

Remaining PTO hours come from QuickBooks Time (TSheets / Intuit Workforce) `users.pto_balances`
(seconds per PTO type). Synced employees get `employees.pto_balance_source = 'quickbooks_time'`;
Orbis shows that balance as-is (it is already net of time taken), with a per-type breakdown.
Manual "Adjust banked PTO" (Matthew only) switches an employee back to `manual` until the next sync.

Pieces:
- Migration `20261029150000_pto_balance_qbt_sync.sql` — adds `pto_balance_source`, `pto_balance_breakdown`;
  lets the service role (sync) write PTO fields; everyone except Matthew is still blocked.
- `scripts/sync_qbt_pto_balances.py` + `.github/workflows/sync-qbt-pto.yml` — daily 6:00 AM ET.
- Edge Function `sync-qbt-pto` — Reports → **PTO balances (QuickBooks Time)** → Preview / Refresh (admins).
- Employee list **PTO hrs** column; profile Time Off panel and My Time Off show "From QuickBooks Time · as of …".

Matching: QBT email = work or personal email → exact first + last name → first name + shared last-name word
(unique only). Never creates or deletes employees. Unmatched users are listed and skipped.

Deploy:

```bash
npx supabase db push                              # applies 20261029150000_pto_balance_qbt_sync.sql
npx supabase functions deploy sync-qbt-pto        # QBT_ACCESS_TOKEN secret is already set
git push                                          # Vercel redeploys the UI
```

First run (dry run, writes nothing): GitHub → Actions → **Sync PTO from QuickBooks Time** → Run workflow
(leave "Dry run" checked), or Reports → **Preview matches**. Review the matched / not matched lists.

Turn on daily writes: GitHub → Settings → Secrets and variables → Actions → **Variables** →
`PTO_SYNC_ENABLED = true`. Until then the 6 AM scheduled run is a dry run.

Optional variable / secret `QBT_PTO_TYPES` = comma list of QBT PTO type names to count
(e.g. `PTO,Vacation`). Default counts every PTO type. Set it as a GitHub Actions variable and, for the
Reports button, `npx supabase secrets set QBT_PTO_TYPES=...`.

Local: `python3 scripts/sync_qbt_pto_balances.py --dry-run` (uses `scripts/.env.weekly_report`).

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
