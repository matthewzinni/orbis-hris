import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261103140000_insurance_discussions.sql'),
  'utf8'
);

describe('insurance discussions migration', () => {
  it('limits insurance check-offs to HR admins', () => {
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('revoke all on public.insurance_discussions from anon, authenticated');
    expect(sql).toContain('using (public.orbis_is_admin())');
    expect(sql).not.toContain('orbis_is_supervisor');
  });

  it('records the signed-in admin as the person who checked it off', () => {
    expect(sql).toContain('lower(trim(discussed_by)) = public.orbis_auth_email()');
  });
});
