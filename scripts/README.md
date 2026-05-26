# Orbis scripts

## Import stay interviews (`import_stay_interviews.py`)

Bulk-insert rows into `public.stay_interviews` and attach them to employees using the same `employee_id` value the app uses: **`employees.id`** (Orbis `dbId`).

### Setup

1. Use a trusted machine. You need the **service role** key (Settings → API in Supabase). Do not commit it or use it in the Vite client.
2. Export credentials in your shell (or a local env file you never commit):

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

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
- If `select=id,employee_id,first_name,last_name,email` fails because a column is missing in your project, adjust the query in `fetch_employees()` to match your schema.
