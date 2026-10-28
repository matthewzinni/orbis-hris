// Admin "Send now" for the weekly time-off report (Reports → Time off this week).
// Same report as scripts/weekly_time_off_email.py (Monday GitHub Action): pulls this week's
// time off request entries from QuickBooks Time (TSheets) and emails approved + pending lists.
//
// Secrets (supabase secrets set ...):
//   QBT_ACCESS_TOKEN                      QuickBooks Time API access token
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM   (same as notify-leave-request)
//   TIME_OFF_EXTRA_EMAILS                 optional extra leadership recipients
//
// Body: { recipients?: 'leadership' | 'me', week_of?: 'YYYY-MM-DD' }

import { createClient } from 'npm:@supabase/supabase-js@2';
import { jsonResponse, requireOrbisAuth } from '../_shared/orbisEdgeAuth.ts';

const QBT_API = 'https://rest.tsheets.com/api/v1';
const ET = 'America/New_York';

const LEADERSHIP_EMAILS = [
  'matthew.zinni@btwglobal.com',
  'trent.wynne@btwglobal.com',
  'brent.wynne@btwglobal.com',
];

type QbtEntry = {
  id?: number;
  status?: string;
  date?: string;
  start_time?: string;
  duration?: number;
  user_id?: number;
  jobcode_id?: number;
  active?: boolean;
};

type Row = { name: string; status: string; days: Map<string, number>; types: Set<string> };

class QbtError extends Error {}

// ---------------------------------------------------------------------------
// Dates (America/New_York)
// ---------------------------------------------------------------------------

function todayInEt(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ET }).format(new Date());
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // Mon=0
  return addDays(iso, -offset);
}

function etOffset(iso: string): string {
  // e.g. "-04:00" or "-05:00" for that date at noon ET.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${iso}T16:00:00Z`));
  const name = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT-05:00';
  return name.replace('GMT', '') || '-05:00';
}

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const wd = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  return `${wd} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function fmtLong(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

// ---------------------------------------------------------------------------
// QuickBooks Time
// ---------------------------------------------------------------------------

async function qbtGet(token: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = `${QBT_API}/time_off_request_entries?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (res.status === 417) return { results: {}, more: false, supplemental_data: {} };
  if (res.status === 401) {
    throw new QbtError('QuickBooks Time rejected QBT_ACCESS_TOKEN (401). Create a new token and update the secret.');
  }
  if (!res.ok) {
    throw new QbtError(`QuickBooks Time HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

async function fetchEntries(
  token: string,
  params: Record<string, string>,
  entries: Map<string, QbtEntry>,
  users: Record<string, { first_name?: string; last_name?: string }>,
  jobcodes: Record<string, { name?: string }>
): Promise<void> {
  for (let page = 1; page <= 50; page++) {
    const body = await qbtGet(token, {
      ...params,
      supplemental_data: 'yes',
      limit: '200',
      page: String(page),
    });
    const results = (body.results || {}) as { time_off_request_entries?: Record<string, QbtEntry> };
    for (const [id, entry] of Object.entries(results.time_off_request_entries || {})) entries.set(id, entry);
    const supp = (body.supplemental_data || {}) as Record<string, Record<string, unknown>>;
    Object.assign(users, supp.users || {});
    Object.assign(jobcodes, supp.jobcodes || {});
    if (!body.more) break;
  }
}

async function collectWeek(token: string, monday: string) {
  const sunday = addDays(monday, 6);
  const entries = new Map<string, QbtEntry>();
  const users: Record<string, { first_name?: string; last_name?: string }> = {};
  const jobcodes: Record<string, { name?: string }> = {};

  // All-day entries carry a date; partial-day entries carry start/end times.
  for (let i = 0; i < 7; i++) {
    await fetchEntries(token, { date: addDays(monday, i) }, entries, users, jobcodes);
  }
  await fetchEntries(
    token,
    {
      start_time: `${monday}T00:00:00${etOffset(monday)}`,
      end_time: `${sunday}T23:59:59${etOffset(sunday)}`,
    },
    entries,
    users,
    jobcodes
  );

  const grouped = new Map<string, Row>();
  for (const entry of entries.values()) {
    const status = String(entry.status || '').toLowerCase();
    if (status !== 'approved' && status !== 'pending') continue;
    if (entry.active === false) continue;
    const day = String(entry.date || entry.start_time || '').slice(0, 10);
    if (!day || day < monday || day > sunday) continue;

    const user = users[String(entry.user_id)] || {};
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || `User ${entry.user_id}`;
    const kind = String(jobcodes[String(entry.jobcode_id)]?.name || 'Time off').trim();
    const hours = Number(entry.duration || 0) / 3600;

    const key = `${name}|${status}`;
    const row = grouped.get(key) || { name, status, days: new Map(), types: new Set() };
    row.days.set(day, (row.days.get(day) || 0) + hours);
    row.types.add(kind);
    grouped.set(key, row);
  }

  const rows = [...grouped.values()].sort((a, b) => {
    const da = [...a.days.keys()].sort()[0];
    const db = [...b.days.keys()].sort()[0];
    return da === db ? a.name.localeCompare(b.name) : da.localeCompare(db);
  });

  return {
    monday,
    sunday,
    approved: rows.filter((r) => r.status === 'approved'),
    pending: rows.filter((r) => r.status === 'pending'),
  };
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtHours(h: number): string {
  return h <= 0 ? 'All day' : `${Number(h.toFixed(2))} hrs`;
}

function renderRows(rows: Row[], emptyText: string): string {
  if (!rows.length) {
    return `<p style="color:#64748b;font-size:14px;margin:6px 0 18px;">${esc(emptyText)}</p>`;
  }
  const cell = 'padding:8px 10px;border-bottom:1px solid #e2e8f0;';
  const body = rows
    .map((r) => {
      const days = [...r.days.entries()].sort(([a], [b]) => a.localeCompare(b));
      const when = days.map(([d, h]) => `${esc(fmtDay(d))} &middot; ${esc(fmtHours(h))}`).join('<br>');
      const total = Number(days.reduce((s, [, h]) => s + h, 0).toFixed(2));
      return (
        `<tr><td style="${cell}font-weight:600;">${esc(r.name)}</td><td style="${cell}">${when}</td>` +
        `<td style="${cell}">${esc([...r.types].sort().join(', '))}</td>` +
        `<td style="${cell}text-align:right;">${total}</td></tr>`
      );
    })
    .join('');
  return (
    '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:6px 0 22px;">' +
    '<tr style="background:#f1f5f9;text-align:left;"><th style="padding:8px 10px;">Employee</th>' +
    '<th style="padding:8px 10px;">Days</th><th style="padding:8px 10px;">Type</th>' +
    `<th style="padding:8px 10px;text-align:right;">Total hrs</th></tr>${body}</table>`
  );
}

function buildHtml(week: Awaited<ReturnType<typeof collectWeek>>, sentBy: string): string {
  const span = `${fmtLong(week.monday)} – ${fmtLong(week.sunday)}, ${week.sunday.slice(0, 4)}`;
  const a = week.approved.length;
  const p = week.pending.length;
  const summary = `${a} ${a === 1 ? 'person' : 'people'} with approved time off · ${p} pending ${p === 1 ? 'request' : 'requests'}`;
  return `<html><body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#0f172a;max-width:760px;margin:0 auto;padding:24px;">
  <div style="padding-bottom:16px;margin-bottom:22px;border-bottom:2px solid #e2e8f0;">
    <div style="font-size:26px;font-weight:700;letter-spacing:0.32em;">ORBIS</div>
    <div style="margin-top:8px;font-size:12px;color:#64748b;">HR Intelligence &amp; Operations · BTW Global, LLC</div>
    <div style="margin-top:12px;font-size:18px;font-weight:700;color:#102a43;">Time Off This Week</div>
    <div style="margin-top:4px;font-size:13px;color:#64748b;">${esc(span)}</div>
  </div>
  <p style="font-size:15px;margin:0 0 18px;">${esc(summary)}. Source: QuickBooks Time (TSheets).</p>
  <h2 style="font-size:16px;margin:0;">Approved time off</h2>
  ${renderRows(week.approved, 'No approved time off this week.')}
  <h2 style="font-size:16px;margin:0;">Pending approval</h2>
  ${renderRows(week.pending, 'No pending requests for this week.')}
  <p style="font-size:12px;color:#64748b;margin-top:24px;">
    Approve or deny pending requests in QuickBooks Time. Sent from Orbis by ${esc(sentBy)}.
  </p>
</body></html>`;
}

async function sendSmtpEmail(options: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
}): Promise<void> {
  const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts');
  const client = new SMTPClient({
    connection: {
      hostname: options.host,
      port: options.port,
      tls: true,
      auth: { username: options.user, password: options.pass },
    },
  });
  await client.send({
    from: options.from,
    to: options.to,
    subject: options.subject,
    content: 'This email is best viewed in an HTML email client.',
    html: options.html,
  });
  await client.close();
}

function splitEmails(raw: string): string[] {
  return raw
    .split(/[,\s;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const auth = await requireOrbisAuth(req, 'orbis_is_admin', 'send-time-off-report');
  if (!auth.ok) return auth.response;

  try {
    const token = String(Deno.env.get('QBT_ACCESS_TOKEN') || '').trim();
    const smtpHost = Deno.env.get('SMTP_HOST') || '';
    const smtpUser = Deno.env.get('SMTP_USER') || '';
    const smtpPass = Deno.env.get('SMTP_PASS') || '';
    if (!token) {
      return jsonResponse({ error: 'QuickBooks Time is not connected. Set the QBT_ACCESS_TOKEN secret.' }, 503);
    }
    if (!smtpHost || !smtpUser || !smtpPass) {
      return jsonResponse({ error: 'Email is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS secrets.' }, 503);
    }

    const body = (await req.json().catch(() => ({}))) as { recipients?: string; week_of?: string };
    const weekOf = /^\d{4}-\d{2}-\d{2}$/.test(String(body.week_of || '')) ? String(body.week_of) : todayInEt();
    const monday = mondayOf(weekOf);

    // Caller's email (for "send to me" and the footer).
    const userRes = await fetch(`${auth.supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: auth.authHeader, apikey: auth.supabaseAnonKey },
    });
    const callerEmail = userRes.ok
      ? String(((await userRes.json()) as { email?: string }).email || '').toLowerCase()
      : '';

    let to: string[];
    if (body.recipients === 'me') {
      if (!callerEmail) return jsonResponse({ error: 'Could not determine your email address.' }, 400);
      to = [callerEmail];
    } else {
      const set = new Set<string>(LEADERSHIP_EMAILS);
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      if (serviceKey) {
        const admin = createClient(auth.supabaseUrl, serviceKey);
        const { data: admins } = await admin
          .from('user_access')
          .select('email')
          .eq('role', 'admin')
          .eq('approval_status', 'approved');
        (admins || []).forEach((row: { email?: string }) => {
          const email = String(row.email || '').trim().toLowerCase();
          if (email) set.add(email);
        });
      }
      splitEmails(String(Deno.env.get('TIME_OFF_EXTRA_EMAILS') || '')).forEach((e) => set.add(e));
      to = [...set];
    }

    const week = await collectWeek(token, monday);
    const d = new Date(`${monday}T12:00:00Z`);
    const subject = `Time off this week — ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;

    await sendSmtpEmail({
      host: smtpHost,
      port: Number(Deno.env.get('SMTP_PORT') || '587'),
      user: smtpUser,
      pass: smtpPass,
      from: Deno.env.get('MAIL_FROM') || smtpUser,
      to,
      subject,
      html: buildHtml(week, callerEmail || 'an Orbis admin'),
    });

    return jsonResponse({
      ok: true,
      week_start: week.monday,
      week_end: week.sunday,
      approved: week.approved.length,
      pending: week.pending.length,
      recipients: to.length,
    });
  } catch (err) {
    console.error('[send-time-off-report]', err);
    const message = err instanceof QbtError ? err.message : `Could not send the report: ${String(err)}`;
    return jsonResponse({ error: message }, 500);
  }
});
