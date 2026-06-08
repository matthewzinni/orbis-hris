# Orbis scripts

## Weekly HR email (`weekly_orbis_report_email.py`)

Sends an HTML snapshot (headcount, stay interviews due, open investigations, discipline, operations) to **matthew.zinni@btwglobal.com** by default.

### Setup

1. Copy `scripts/examples/weekly_report.env.example` → `scripts/.env.weekly_report` (gitignored).
2. Fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and SMTP credentials (BTW uses **Google Workspace**: `smtp.gmail.com:587` + Google **app password**).
3. Test without sending:

```bash
set -a && source scripts/.env.weekly_report && set +a
python3 scripts/weekly_orbis_report_email.py --dry-run
```

4. Send once:

```bash
python3 scripts/weekly_orbis_report_email.py
```

Override recipients and schedule in `scripts/.env.weekly_report`:

```env
MAIL_TO=you@btwglobal.com,other@btwglobal.com
WEEKLY_REPORT_DAY_OF_WEEK=1
WEEKLY_REPORT_HOUR=13
WEEKLY_REPORT_MINUTE=0
```

(`DAY_OF_WEEK`: 0=Sun, 1=Mon, … 6=Sat — local Mac time.)

### Schedule (recommended: GitHub Actions — Mac can sleep)

The workflow `.github/workflows/weekly-orbis-report.yml` sends every **Monday at 1:00 PM US Eastern** from GitHub’s servers. Your Mac does **not** need to be on.

1. One-time: push the workflow to GitHub, then load secrets from your local env file:

```bash
chmod +x scripts/setup_github_weekly_report_secrets.sh
./scripts/setup_github_weekly_report_secrets.sh
```

2. Test immediately:

```bash
gh workflow run weekly-orbis-report.yml
```

3. View runs: GitHub → **Actions** → **Weekly Orbis HR Report**.

The script **retries SMTP up to 5 times** (5 minutes apart) before failing. In winter (EST), edit the workflow cron from `0 17 * * 1` to `0 18 * * 1` so it stays 1:00 PM local.

Required GitHub secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_TO`, `ORBIS_APP_URL`.

### Schedule (optional: Mac cron — Mac must be awake)

```bash
chmod +x scripts/run_weekly_report.sh scripts/install_weekly_report_cron.sh
./scripts/install_weekly_report_cron.sh
```

Uses `WEEKLY_REPORT_*` from `.env.weekly_report` (default **Monday 1:00 PM** local). Logs: `scripts/logs/weekly_report.log`. Prefer GitHub Actions if the laptop is often asleep.

Manual send anytime:

```bash
./scripts/run_weekly_report.sh
```

---

## Import stay interviews (`import_stay_interviews.py`)

Bulk-insert rows into `public.stay_interviews` and attach them to employees using the same `employee_id` value the app uses: **`employees.id`** (Orbis `dbId`).

### Setup

1. Use a trusted machine. You need the **service role** key (Settings → API in Supabase). Do not commit it or use it in the Vite client.
2. The Vite `.env` only has `VITE_SUPABASE_*` (anon/publishable). Export **separate** script credentials:

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

   Or point at a local file you never commit, e.g. `tools/.env.python` in a sibling Orbis checkout (same variable names).

3. Prepare a CSV. Start from `examples/stay_interviews_template.csv` (headers only). **Get real `employee_id` values** from Supabase → Table Editor → `employees` → column `id` (Orbis also shows this as the employee / BTW number in the UI). Do not guess IDs.

### Example row (copy into your CSV after replacing IDs)

Use the exact `id` from your `employees` table for the first column. Example shape only:

```csv
employee_id,interview_date,interview_type,q1,q2,q3,q4,q5,q6,q7,manager_summary
BTW261,2026-05-20,Annual,Working with my team on new launches.,Clear priorities from my manager.,None major right now.,More cross-training on the ERP module.,Yes — weekly 1:1s help.,Nothing immediate; commute is the main pain.,A parking subsidy was discussed; follow up in 30 days.,Strong engagement; schedule follow-up on parking ask.
```

`interview_type` should be one of the app options: **30-Day**, **90-Day**, **6-Month**, **Annual**, **Retention Risk**, **Other** (or leave blank / use `Stay Interview` for a generic label).

### Run

```bash
python3 scripts/import_stay_interviews.py path/to/your.csv --dry-run
python3 scripts/import_stay_interviews.py path/to/your.csv
```

`--dry-run` resolves every employee and validates dates without inserting.

### Matching employees

The script matches a row to an employee using, in order:

- `employee_id`, `id`, `emp_id`, `btw`, or `employee_btw` — must equal `employees.id` or `employees.employee_id` as stored in the database  
- `email` — case-insensitive match to `employees.email`  
- `first_name` + `last_name` — case-insensitive; fails if more than one employee shares that pair (then use `employee_id` or `email`)

**BTW numbering (Orbis):** In-app ID generation uses calendar year prefixes (`src/services/employeeIds.ts`): e.g. hires in **2026** use prefix **BTW26** plus a sequence (**BTW261**, **BTW262**, …). From **2027** onward, IDs look like **BTW2701** (two-digit sequence). Your database may differ if IDs were imported manually—always trust the `employees.id` column.

### Required CSV fields

- One of the employee locators above  
- `interview_date` — `YYYY-MM-DD` or `MM/DD/YYYY` (US-style)

### Optional fields

Same as the app / table: `interview_type` (defaults to `Stay Interview`), `q1`–`q7`, `manager_summary`.

### Notes

- RLS is bypassed with the service role; run only with data you are allowed to load.
- `fetch_employees()` selects `id,first_name,last_name` only (this project stores the BTW id in `employees.id`; there is no `email` or `employee_id` column).
- Bulk CSV from Word templates: `python3 scripts/build_stay_interviews_csv.py` reads `~/Desktop/Work/Stay Interviews/Stay_Interview_*.docx` and writes `scripts/data/stay_interviews_import.csv` (gitignored).
- `scripts/data/*.csv` is gitignored because rows contain interview responses (PII).

---

## Import time off / leave (`import_leave_requests.py`)

Bulk-load historical or approved PTO from **QuickBooks Time (TSheets)** (or any CSV) into `public.leave_requests` without using the drawer one row at a time.

### Export from QuickBooks Time

1. In QBT Time, open **Time Off** (or **Reports → Time Off**).
2. Filter **Status: Approved** (and date range if you only want history).
3. Export / download as **CSV** (report export or list export — column names vary slightly; the importer accepts common aliases).

Expected columns (headers are flexible):

| QBT Time column | Maps to |
|-----------------|---------|
| Team Member | employee match by name |
| Days Off | `Jun 26, 2026` or `Aug 20 - 24, 2026` |
| Duration | hours (`24h 00m` → 24) |
| Code | leave type (`Paid Time Off (PTO)` → `pto`, `Holiday` → `other`) |
| Submitted On | stored in notes + optional `approved_at` |
| Status | `approved`, `denied`, etc. (blank → `--default-status`) |

You can also use explicit columns: `employee_id`, `start_date`, `end_date`, `hours`, `leave_type`, `status`, `notes`.

Template: `examples/leave_requests_template.csv`.

### Setup

Same as stay interviews — service role on a trusted machine:

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export IMPORT_ACTOR_EMAIL="matthew.zinni@btwglobal.com"   # optional; stored on rows
```

### Run

```bash
python3 scripts/import_leave_requests.py path/to/time_off_export.csv --dry-run
python3 scripts/import_leave_requests.py path/to/time_off_export.csv
```

`--dry-run` resolves every employee and validates dates without inserting. Re-running with `--skip-duplicates` (default) skips rows already in Orbis.

Options:

- `--default-status approved` — for historical QBT exports where Status is always Approved
- `--no-skip-duplicates` — force insert even if a similar row exists
- `--source-label "QuickBooks Time"` — note prefix on each row

### Matching employees

Same rules as stay interviews, plus **Team Member** / **employee_name** from QBT exports (e.g. `Christian Ange`). If a name is ambiguous, add an `employee_id` column with the Orbis `employees.id` (BTW number).

### Notes

- Imports do **not** change employee status to Leave or create payroll handoffs (historical load only).
- Imported rows set `deduct_from_pto_balance = false` so they do not subtract again from the QBT baseline.
- RLS is bypassed with the service role; run only with data you are allowed to load.

---

## Import PTO balances (`import_pto_balances.py`)

Load **Paid Time Off (PTO)** hour totals from a QuickBooks Time balance report into `employees.pto_balance_hours`. Orbis shows **Time Off — XX.XX hours** in the employee drawer. That baseline is already net of PTO approved in QBT; only **new** requests created and approved in Orbis reduce remaining hours.

Prepared from your `btwgloballlc_pto_balances_2026-06-03` report: `examples/pto_balances_2026-06-03.csv`.

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

python3 scripts/import_pto_balances.py scripts/examples/pto_balances_2026-06-03.csv --dry-run
python3 scripts/import_pto_balances.py scripts/examples/pto_balances_2026-06-03.csv --as-of 2026-06-03
```

CSV columns: `employee_id` **or** `first_name` + `last_name`, and `pto_balance_hours`.

PDF rows with no Orbis match (add manually if needed): **Jonathan UY**, **Serina Liverman**, **Tobi Mutuc**, **Kelcee Blevins**.

Name fixes in the example CSV: `Castro-Vazquez`, `Deocampo`, `Nicholas` Jordan, `Matthew` Hunsinger, `Sam` Montgomery, `Trent` Wynne, `Doricel` Zenil.
