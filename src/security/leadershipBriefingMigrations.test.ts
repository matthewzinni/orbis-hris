import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../supabase/migrations/20261118120000_leadership_briefings.sql', import.meta.url), 'utf8');
describe('leadership briefing storage policy', () => {
  it('enables RLS and restricts reads and inserts to admins', () => {
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('for select to authenticated using (public.orbis_is_admin())');
    expect(sql).toContain('with check (public.orbis_is_admin() and created_by = auth.uid())');
  });
  it('permits immutable versions only and enforces a seven-day period', () => {
    expect(sql).toContain('revoke all on public.leadership_briefings from anon, authenticated');
    expect(sql).toContain('grant select, insert on public.leadership_briefings to authenticated');
    expect(sql).not.toMatch(/grant[^;]*(update|delete)/i);
    expect(sql).toContain('period_end = period_start + 6');
  });
});
