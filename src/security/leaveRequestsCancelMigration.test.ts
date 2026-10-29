import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8');
}

describe('leave_requests employee-cancel guard migration', () => {
  const sql = readMigration('20261029162000_leave_requests_cancel_guard.sql');

  it('requires the request to still be requested before an employee can cancel it', () => {
    expect(sql).toMatch(/employee_id::text = public\.orbis_linked_employee_id\(\)\s*\n\s*and status = 'requested'/);
  });

  it('adds a trigger blocking column tampering on self-service cancel', () => {
    expect(sql).toContain('orbis_guard_leave_request_employee_cancel');
    expect(sql).toContain('before update on public.leave_requests');
    expect(sql).toContain('new.hours is distinct from old.hours');
    expect(sql).toContain('new.approved_by is distinct from old.approved_by');
  });

  it('leaves admin and supervisor updates unrestricted by the trigger', () => {
    expect(sql).toMatch(/if public\.orbis_is_admin\(\) or public\.orbis_is_supervisor\(\) then\s*\n\s*return new;/);
  });
});
