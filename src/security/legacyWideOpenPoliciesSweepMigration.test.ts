import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8');
}

describe('drop legacy wide-open policies sweep migration', () => {
  const sql = readMigration('20261030140000_drop_legacy_wide_open_policies_sweep.sql');

  it('drops both anon-readable holes on employees and candidates', () => {
    expect(sql).toContain('drop policy if exists "Allow all select" on public.employees');
    expect(sql).toContain('drop policy if exists read_employees_anon on public.employees');
    expect(sql).toContain('drop policy if exists "Allow all select" on public.candidates');
  });

  it('drops the public-role employee_audit_logs holes', () => {
    expect(sql).toContain('drop policy if exists "Allow audit log inserts" on public.employee_audit_logs');
    expect(sql).toContain('drop policy if exists "Allow inserts" on public.employee_audit_logs');
    expect(sql).toContain('drop policy if exists "Allow audit log select" on public.employee_audit_logs');
  });

  it('drops the unrestricted employees delete/update holes', () => {
    expect(sql).toContain('drop policy if exists "Delete" on public.employees');
    expect(sql).toContain('drop policy if exists employees_update_authenticated on public.employees');
  });

  it('drops the bucket-wide storage.objects holes for documents/document-library/employee-documents', () => {
    expect(sql).toContain('drop policy if exists "Allow authenticated deletes" on storage.objects');
    expect(sql).toContain('drop policy if exists "Allow_Delete_Documents 75ydll_0" on storage.objects');
  });

  it('never drops the legitimately-scoped policies it was told to leave alone', () => {
    expect(sql).not.toMatch(/drop policy if exists "Only Matthew/);
    expect(sql).not.toMatch(/drop policy if exists "Scoped /);
    expect(sql).not.toMatch(/drop policy if exists "Users can read own profile"/);
    expect(sql).not.toMatch(/drop policy if exists "Users can read own access row"/);
    expect(sql).not.toMatch(/drop policy if exists "Admins can view all employees"/);
    expect(sql).not.toMatch(/drop policy if exists "Supervisors can view/);
    expect(sql).not.toMatch(/drop policy if exists "Supervisors can update their employees"/);
    expect(sql).not.toMatch(/drop policy if exists "HR admins can delete emergency contacts"/);
  });

  it('never drops an orbis_* policy', () => {
    expect(sql).not.toMatch(/drop policy if exists orbis_/);
  });
});
