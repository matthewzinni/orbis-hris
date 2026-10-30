import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8');
}

describe('stay_interviews HR-only migration', () => {
  const sql = readMigration('20261029163000_stay_interviews_hr_only.sql');

  it('restricts every stay_interviews policy to the HR-staff helper', () => {
    expect(sql).toContain('orbis_stay_interviews_select');
    expect(sql).toContain('orbis_stay_interviews_insert');
    expect(sql).toContain('orbis_stay_interviews_update');
    expect(sql).toContain('orbis_stay_interviews_delete');
    expect(sql).not.toMatch(/(using|with check) \(public\.orbis_employee_child_accessible/);
  });

  it('uses the same HR-staff helper AUD-006 introduced for incident_reports', () => {
    const occurrences = sql.match(/orbis_hr_staff_child_accessible/g) || [];
    expect(occurrences.length).toBeGreaterThanOrEqual(4);
  });
});
