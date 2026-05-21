# Supabase for Orbis

Database changes live in **`supabase/migrations/`**. Push them with the Supabase CLI instead of pasting SQL in the dashboard.

## One-time setup

### 1. Install dependencies

```bash
npm install
```

The CLI is included as a dev dependency (`supabase` package).

### 2. Log in to Supabase

```bash
npm run db:login
```

Opens a browser to authenticate the CLI.

### 3. Link this repo to your remote project

Find **Project reference ID** in the Supabase Dashboard:  
**Project Settings → General → Reference ID** (e.g. `abcdefghijklmnop`).

```bash
npm run db:link
```

When prompted, paste that reference ID. This writes `supabase/.temp/project-ref` (gitignored).

Alternatively:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

### 4. App environment variables

Copy `.env.example` to `.env` and set:

- `VITE_SUPABASE_URL` — Project Settings → API → Project URL  
- `VITE_SUPABASE_ANON_KEY` — Project Settings → API → anon public key  

## Push migrations (RLS, candidate notes, etc.)

```bash
npm run db:push
```

Applies any migration in `supabase/migrations/` that is not yet on the remote database.

Check status:

```bash
npm run db:status
```

## Migration order

| File | Purpose |
|------|---------|
| `20250520120000_candidate_notes.sql` | `candidate_notes` table |
| `20250520120001_orbis_rls_helpers.sql` | Role + supervisor helper functions |
| `20250520120002_orbis_rls_policies.sql` | RLS policies on Orbis tables |

The standalone files `candidate_notes.sql`, `orbis_rls_helpers.sql`, and `orbis_rls_policies.sql` in this folder are copies of the migrations (for quick reference in the SQL editor). **Prefer `npm run db:push` for applying changes.**

## Access model (RLS)

| Role | Employees | Notes / meetings / discipline / incidents / stay interviews | Performance reviews | Candidates |
|------|-----------|----------------------------------------------------------------|---------------------|------------|
| **admin** | Full CRUD | Full CRUD | Full CRUD | Full CRUD |
| **supervisor** | Read direct reports only | CRUD for their team | CRUD for their team | No access |
| **user** | Read-only directory | No access | No access | No access |

Supervisor matching mirrors `employeeMatchesSupervisorAccess()` in `src/services/access.ts`.

## Optional: local Supabase (Docker)

```bash
npm run db:start    # local Postgres + Studio
npm run db:stop
```

Not required if you only use hosted Supabase + `db:push`.

## New migrations later

```bash
npm run db:new -- my_change_name
# edit supabase/migrations/<timestamp>_my_change_name.sql
npm run db:push
```

Or pull schema from remote:

```bash
npm run db:pull
```

## Service role

The **service_role** key bypasses RLS. Never put it in the Vite app or commit it to git.
