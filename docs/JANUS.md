# Janus — Relationship CRM (Product Spec v0.1)

**Orbis suite module · Target MVP: 2 weeks · Audience: Brent, Dave, BD team**

---

## Problem

BTW’s relationship knowledge lives in people’s heads, email threads, and a legacy Copper export—not in one searchable place. Leadership shouldn’t ask “Hey Dave, what happened with Sourcebooks on June 5?” or hunt for the Macmillan agreement. If a key person is unavailable, client history, contacts, and meeting context shouldn’t disappear with them.

## What Janus is

**Janus** is Orbis for **external relationships**: clients, vendors, partners, and publishers. Same login and design language as Orbis HRIS; different domain.

| Orbis | Janus |
|-------|-------|
| Employees, HR, compliance | Accounts, contacts, agreements |
| Candidate pipeline (hiring) | Relationship history (BD/clients) |
| Internal operations issues | External touchpoints & meetings |

**Janus is not:** a full Salesforce replacement, live call recording platform, or email client (v1).

---

## MVP scope (2 weeks)

### In scope

1. **Accounts** — companies (Macmillan, Sourcebooks, Tyndale, print vendors, etc.)
2. **Contacts** — people at each account: phone, email, mailing address, role, personal notes
3. **Documents** — agreements, SOWs, contracts linked to an account (upload + search)
4. **Meetings** — date, attendees, transcript/notes, AI summary, follow-up date
5. **Activities** — lightweight log: call, email, visit, “touch scheduled for June 12”
6. **Search** — find account, contact, or meeting by name/date keyword
7. **Copper import** — one-time CSV import of companies + contacts (minimum)

### Out of scope (v2+)

- Live meeting transcription / Zoom-Teams rooms integration
- Opportunity pipeline & revenue forecasting
- Email/calendar two-way sync
- Mobile app
- Automated vendor matrix integration (manual links OK in v1)

---

## User stories (acceptance)

| Who | Need |
|-----|------|
| **Brent** | Open Sourcebooks → Meetings → June 5 recap without asking Dave |
| **Brent** | Open Macmillan → Documents → find agreement |
| **BD / Dave** | Log a meeting: pick account, paste transcript, get AI summary + follow-ups saved |
| **Anyone authorized** | Look up contact: phone, email, address, notes (e.g. personal context) |
| **Leadership** | See recent meetings and upcoming touches across all accounts |

---

## Screens

```
Nav:  … | Janus | …

┌─ Janus Home ─────────────────────────────────────────┐
│  Search accounts, contacts, meetings…                │
│  Recent meetings · Upcoming touches · Quick add      │
└──────────────────────────────────────────────────────┘

┌─ Account list ───────────────────────────────────────┐
│  Name · Type · Owner · Last touch · Status           │
│  [+ New account]                                     │
└──────────────────────────────────────────────────────┘

┌─ Account detail (Macmillan) ─────────────────────────┐
│  Overview | Contacts | Meetings | Documents | Activity│
│  ─────────────────────────────────────────────────── │
│  Contacts tab: name, role, phone, email, address     │
│  Meetings tab: Jun 5 — Sourcebooks recap (summary)   │
│  Documents tab: agreement.pdf, SOW-2024.docx         │
│  Activity tab: timeline of touches                   │
└──────────────────────────────────────────────────────┘

┌─ Log meeting (modal / page) ───────────────────────────┐
│  Account: [Sourcebooks ▼]  Date: [2025-06-05]        │
│  Attendees: [tags]                                   │
│  Transcript / notes: [paste or upload]               │
│  → [Generate summary] → saves Meeting + Activities   │
│  Follow-up date: [2025-06-12] (optional)             │
└──────────────────────────────────────────────────────┘
```

---

## Data model (Supabase)

Tables prefixed `janus_`. RLS: authenticated users with Janus role; admins read/write all.

### `janus_accounts`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | Required — display name |
| account_type | text | `client`, `vendor`, `partner`, `publisher`, `other` |
| status | text | `active`, `inactive`, `prospect` |
| owner_email | text | Primary relationship owner |
| website | text | Optional |
| phone | text | Main line |
| address_* | text | Street, city, state, zip |
| notes | text | Account-level context |
| copper_id | text | Import traceability |
| created_at, updated_at | timestamptz | |

### `janus_contacts`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| account_id | uuid | FK → janus_accounts |
| first_name, last_name | text | |
| title | text | Role at company |
| email, phone | text | |
| address_* | text | Mailing address if different from account |
| notes | text | Personal/context notes |
| is_primary | boolean | Main contact for account |
| copper_id | text | Import traceability |

### `janus_meetings`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| account_id | uuid | FK |
| meeting_date | date | |
| title | text | e.g. “Sourcebooks Q2 review” |
| attendees | text[] | Names/emails |
| transcript | text | Raw paste or import |
| summary | text | AI-generated |
| action_items | text | AI-generated bullet list |
| follow_up_date | date | “Touch again June 12” |
| logged_by_email | text | |
| created_at | timestamptz | |

### `janus_documents`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| account_id | uuid | FK |
| title | text | |
| file_path | text | Supabase storage path |
| file_name, mime_type | text | |
| document_type | text | `agreement`, `sow`, `nda`, `other` |
| effective_date | date | Optional |
| uploaded_by_email | text | |

### `janus_activities`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| account_id | uuid | FK |
| contact_id | uuid | FK optional |
| activity_type | text | `call`, `email`, `meeting`, `visit`, `note`, `follow_up` |
| activity_date | date | |
| subject | text | |
| body | text | |
| created_by_email | text | |

Storage bucket: `janus-documents` (mirrors operations attachments pattern).

---

## Meeting → CRM flow (v1)

```
Meeting ends
    → User opens Janus → Log meeting
    → Select account + date + paste transcript (or typed notes)
    → AI generates summary + action items + suggested follow-up date
    → Saved to janus_meetings + janus_activities timeline
    → Leadership can read anytime without intermediaries
```

**Cost control:** No live transcribe in v1. Post-meeting paste/upload only. Zoom/Otter export import in v2.

---

## Roles & access

| Role | Access |
|------|--------|
| **admin** | Full Janus (existing Orbis admins: Brent, Matthew, etc.) |
| **janus** (new) | Create/edit accounts, contacts, meetings, documents |
| **janus_readonly** | View all; no edit (leadership read-only) |
| **user / supervisor** | No Janus (HR portal unchanged) |

Implemented via `user_access.role` extension + `canAccessAppSection('janusView')`.

---

## Copper migration

1. Obtain Copper admin export (companies, people, notes if available).
2. Map → `janus_accounts`, `janus_contacts`; preserve `copper_id`.
3. Documents: manual upload pass or second import if Copper exported file links.
4. Historical meetings: import as activities or meetings if export includes them.

**Prerequisite:** One-month Copper login or CSV from Dave — schedule in week 1.

---

## Success (30 days post-launch)

- [ ] Brent can self-serve Sourcebooks June 5 meeting recap
- [ ] Macmillan agreement findable in &lt; 30 seconds
- [ ] ≥ 80% of active client/vendor accounts from Copper imported
- [ ] ≥ 1 meeting logged per week by BD team
- [ ] Zero “who has this contact?” Slack threads for imported accounts

---

## Build sequence

| Week | Deliverable |
|------|-------------|
| **1** | Schema + RLS, Janus nav, account list/detail, contacts CRUD, document upload |
| **2** | Log meeting + AI summary, activity timeline, search, Copper CSV import, Janus home dashboard |

---

## Decisions needed (Brent / Dave)

1. **v1 entities OK?** Accounts, Contacts, Meetings, Documents, Activities — no deal pipeline yet?
2. **Who gets edit access?** Dave, Blake, Daniel, others?
3. **Copper export:** Who owns getting the CSV this week?
4. **Meeting input:** Paste transcript acceptable for v1?
5. **Account types:** Confirm list (client, vendor, partner, publisher, other).

---

*Janus — the doorway between past conversations and future touches. Part of the Orbis suite.*
