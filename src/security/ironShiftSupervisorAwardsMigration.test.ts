import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('../../supabase/migrations/20261118140000_iron_shift_supervisor_awards.sql', import.meta.url),
  'utf8'
);

describe('supervisor Iron Shift award policy', () => {
  it('only adds an insert path, limited to iron_shift rows', () => {
    expect(sql).toContain('for insert to authenticated');
    expect(sql).toContain("recognition_type = 'iron_shift'");
    expect(sql).not.toMatch(/for (update|delete|select|all)\b/i);
  });

  it('requires a supervisor, an active direct report, and never the supervisor themselves', () => {
    expect(sql).toContain('public.orbis_is_supervisor()');
    expect(sql).toContain('emp_key is distinct from public.orbis_linked_employee_id()');
    expect(sql).toContain('public.orbis_supervisor_sees_employee(e)');
    expect(sql).toContain("not in ('TERMINATED', 'INACTIVE')");
  });

  it('runs the team check as a locked-down security definer helper', () => {
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = public');
    expect(sql).toContain('revoke all on function public.orbis_can_give_iron_shift_award(text) from public');
  });
});
