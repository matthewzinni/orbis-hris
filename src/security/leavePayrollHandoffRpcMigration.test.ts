import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261120150000_leave_payroll_handoff_rpc.sql'),
  'utf8'
);

function functionBody(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf('as $$', start);
  const close = sql.indexOf('$$;', open + 5);
  return sql.slice(start, close);
}

describe('leave payroll handoff RPC migration', () => {
  it('uses the leave_requests approval rule: admin, or a supervisor who can see the employee', () => {
    const body = functionBody('orbis_can_approve_leave_request');
    expect(body).toContain('security definer');
    expect(body).toContain('set search_path = public');
    expect(body).toMatch(
      /public\.orbis_is_admin\(\)\s*or \(\s*public\.orbis_is_supervisor\(\)\s*and public\.orbis_employee_child_accessible\(lr\.employee_id::text\)/
    );
  });

  it('checks the caller before touching anything and only logs approved leave', () => {
    const body = functionBody('orbis_log_leave_payroll_handoff');
    expect(body).toContain('security definer');
    expect(body).toContain('set search_path = public');
    const guard = body.indexOf('if not public.orbis_can_approve_leave_request(p_leave_request_id)');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(body.indexOf('insert into public.payroll_handoffs'));
    expect(body).toContain("if v_leave.status <> 'approved' then");
  });

  it('logs each leave request once: row lock, payroll_notified, and an existing-handoff check', () => {
    const body = functionBody('orbis_log_leave_payroll_handoff');
    expect(body).toMatch(/from public\.leave_requests\s+where id = p_leave_request_id\s+for update;/);
    expect(body).toMatch(/if v_leave\.payroll_notified then\s+return null;/);
    expect(body).toContain("where ph.payload ->> 'leave_request_id' = v_leave.id::text");
    expect(body).toMatch(/update public\.leave_requests\s+set payroll_notified = true/);
  });

  it('builds the handoff server-side with the payload the payroll email reads', () => {
    const body = functionBody('orbis_log_leave_payroll_handoff');
    expect(body).toContain("'leave_request_id', v_leave.id::text");
    expect(body).toContain("'leave_type', v_leave.leave_type");
    expect(body).toContain("'start_date', v_leave.start_date::text");
    expect(body).toContain("'end_date', v_leave.end_date::text");
    expect(body).toContain("nullif(public.orbis_auth_email(), '')");
    expect(body).toContain("'status',");
  });

  it('is callable by signed-in users only', () => {
    expect(sql).toContain('revoke all on function public.orbis_log_leave_payroll_handoff(uuid) from public, anon;');
    expect(sql).toContain('revoke all on function public.orbis_can_approve_leave_request(uuid) from public, anon;');
    expect(sql).toContain('grant execute on function public.orbis_log_leave_payroll_handoff(uuid) to authenticated;');
    expect(sql).toContain('grant execute on function public.orbis_can_approve_leave_request(uuid) to authenticated;');
  });

  it('leaves payroll_handoffs RLS admin-only', () => {
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/alter table public\.payroll_handoffs/i);
  });
});
