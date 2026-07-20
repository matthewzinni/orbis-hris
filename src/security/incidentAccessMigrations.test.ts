import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8');
}

describe('incident reports access migrations', () => {
  it('restricts incident_reports to HR staff helpers', () => {
    const sql = readMigration('20260720153200_incident_reports_hr_only.sql');
    expect(sql).toContain('orbis_hr_staff_child_accessible');
    expect(sql).toContain('orbis_incident_reports_select');
    expect(sql).not.toContain('orbis_employee_child_accessible');
  });

  it('drops legacy permissive incident policies', () => {
    const sql = readMigration('20260720153400_drop_legacy_incident_policies.sql');
    expect(sql).toContain('Allow authenticated users to select incident reports');
    expect(sql).toContain('Scoped select incident_reports');
  });
});
