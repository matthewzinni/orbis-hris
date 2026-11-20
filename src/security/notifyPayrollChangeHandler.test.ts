/**
 * Runs the notify-payroll-change Edge Function handler under Vitest with an
 * in-memory database and a fake SMTP sender, so no real email is ever sent.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const db: { payroll_handoffs: Row[]; employees: Row[] } = { payroll_handoffs: [], employees: [] };
const sent: Array<{ to: string[]; subject: string; text: string }> = [];
let failNextSend = false;

function query(table: keyof typeof db) {
  const filters: Array<(row: Row) => boolean> = [];
  let patch: Row | null = null;
  const run = () => {
    const rows = db[table].filter((row) => filters.every((f) => f(row)));
    if (patch) rows.forEach((row) => Object.assign(row, patch));
    return rows;
  };
  const builder = {
    select: () => builder,
    update: (values: Row) => {
      patch = values;
      return builder;
    },
    eq: (col: string, value: unknown) => {
      filters.push((row) => row[col] === value);
      return builder;
    },
    is: (col: string, value: unknown) => {
      filters.push((row) => (row[col] ?? null) === value);
      return builder;
    },
    ilike: (col: string, value: string) => {
      filters.push((row) => String(row[col] || '').toLowerCase() === value.toLowerCase());
      return builder;
    },
    limit: () => builder,
    maybeSingle: async () => ({ data: run()[0] || null, error: null }),
    then: (resolve: (v: unknown) => void) => resolve({ data: run(), error: null }),
  };
  return builder;
}

vi.mock('npm:@supabase/supabase-js@2', () => ({
  createClient: () => ({ from: (table: keyof typeof db) => query(table) }),
}));

vi.mock('../../supabase/functions/_shared/orbisEdgeAuth.ts', () => ({
  jsonResponse: (body: Row, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  requireOrbisAuth: async () => ({
    ok: true,
    supabaseUrl: 'http://local.test',
    supabaseAnonKey: 'anon',
    authHeader: 'Bearer x',
  }),
}));

vi.mock('../../supabase/functions/_shared/smtp.ts', () => ({
  sendSmtpEmail: async (options: { to: string[]; subject: string; text: string }) => {
    if (failNextSend) {
      failNextSend = false;
      throw new Error('SMTP 535 auth failed');
    }
    sent.push({ to: options.to, subject: options.subject, text: options.text });
  },
}));

const env: Record<string, string> = {};
let handler: (req: Request) => Promise<Response>;

(globalThis as Row).Deno = {
  env: { get: (key: string) => env[key] },
  serve: (fn: typeof handler) => {
    handler = fn;
  },
};

afterAll(() => {
  delete (globalThis as Row).Deno;
});

async function call(body: Row): Promise<Row> {
  const res = await handler(
    new Request('http://local.test/notify-payroll-change', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, ...(await res.json()) };
}

function seed(changeType: string, overrides: Row = {}) {
  db.payroll_handoffs = [
    {
      id: 'h-1',
      employee_id: 'BTW2150',
      change_type: changeType,
      effective_date: changeType === 'termination' ? '2026-11-20' : '2026-11-24',
      summary: `${changeType} — Jordan Rivera`,
      payload: {},
      created_by: 'matthew.zinni@btwglobal.com',
      created_at: new Date().toISOString(),
      status: 'pending',
      sent_at: null,
      payroll_email_sent_at: null,
      payroll_email_error: null,
      ...overrides,
    },
  ];
}

describe('notify-payroll-change handler', () => {
  beforeEach(async () => {
    sent.length = 0;
    failNextSend = false;
    Object.keys(env).forEach((k) => delete env[k]);
    Object.assign(env, {
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      SMTP_HOST: 'smtp.test',
      SMTP_USER: 'hr@btwglobal.com',
      SMTP_PASS: 'x',
      PAYROLL_NOTIFY_EMAILS: 'payroll-test@example.com',
    });
    db.employees = [
      {
        id: 'BTW2150',
        first_name: 'Jordan',
        last_name: 'Rivera',
        department: 'Warehouse',
        position: 'Forklift Operator',
        hire_date: '2026-11-24',
        pay_type: 'Hourly',
      },
      { id: 'BTW1', first_name: 'Matthew', last_name: 'Zinni', work_email: 'Matthew.Zinni@btwglobal.com' },
    ];
    // Non-literal path keeps tsc from type-checking the Deno-only entry point.
    const entry = '../../supabase/functions/notify-payroll-change/index.ts';
    if (!handler) await import(/* @vite-ignore */ entry);
  });

  it('emails a hire once, even when called twice', async () => {
    seed('new_hire');
    expect(await call({ handoff_id: 'h-1' })).toMatchObject({ status: 200, ok: true, event: 'new_hire' });
    expect(await call({ handoff_id: 'h-1' })).toMatchObject({ skipped: true, reason: 'Already emailed' });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(['payroll-test@example.com']);
    expect(sent[0].text.split('\n')[0]).toBe(
      'Cole, Jordan Rivera was hired. Please add them to payroll.'
    );
    expect(sent[0].text).toContain('Matthew Zinni (matthew.zinni@btwglobal.com)');
    expect(db.payroll_handoffs[0].payroll_email_sent_at).toBeTruthy();
    expect(db.payroll_handoffs[0].status).toBe('sent');
    expect(db.payroll_handoffs[0].sent_at).toBeTruthy();
  });

  it('emails a termination with the required opening line', async () => {
    seed('termination');
    await call({ handoff_id: 'h-1' });
    expect(sent[0].text.split('\n')[0]).toBe(
      'Cole, Jordan Rivera has been terminated. Please process their final paycheck.'
    );
  });

  it('does not email change types that are not enabled', async () => {
    seed('rate', { payload: { field: 'pay_type', from: 'Hourly', to: 'Salary' } });
    expect(await call({ handoff_id: 'h-1' })).toMatchObject({ skipped: true, event: 'pay_type' });
    expect(sent).toHaveLength(0);

    env.PAYROLL_NOTIFY_EVENTS = 'new_hire,termination,pay_type';
    expect(await call({ handoff_id: 'h-1' })).toMatchObject({ ok: true, event: 'pay_type' });
    expect(sent).toHaveLength(1);
  });

  it('records the error and allows a retry when sending fails', async () => {
    seed('new_hire');
    failNextSend = true;
    expect(await call({ handoff_id: 'h-1' })).toMatchObject({ status: 502, error: 'Email failed' });
    expect(db.payroll_handoffs[0].payroll_email_sent_at).toBeNull();
    expect(db.payroll_handoffs[0].payroll_email_error).toContain('SMTP 535');
    expect(db.payroll_handoffs[0].status).toBe('pending');

    expect(await call({ handoff_id: 'h-1' })).toMatchObject({ ok: true });
    expect(sent).toHaveLength(1);
  });

  it('sends nothing without recipients, for old handoffs, or on a dry run', async () => {
    seed('new_hire');
    delete env.PAYROLL_NOTIFY_EMAILS;
    expect(await call({ handoff_id: 'h-1' })).toMatchObject({ skipped: true });

    env.PAYROLL_NOTIFY_EMAILS = 'payroll-test@example.com';
    seed('new_hire', { created_at: '2026-01-01T00:00:00Z' });
    expect(await call({ handoff_id: 'h-1' })).toMatchObject({ skipped: true });

    seed('new_hire');
    const dry = await call({ handoff_id: 'h-1', dry_run: true });
    expect(dry).toMatchObject({ dry_run: true, would_send: true, event: 'new_hire' });
    expect(db.payroll_handoffs[0].payroll_email_sent_at).toBeNull();
    expect(sent).toHaveLength(0);
  });
});
