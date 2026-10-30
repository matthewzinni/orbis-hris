import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8');
}

describe('onboarding_tasks HR-only migration', () => {
  const sql = readMigration('20261029164000_onboarding_tasks_hr_only.sql');

  it('restricts every onboarding_tasks policy to the HR-staff helper', () => {
    expect(sql).toContain('orbis_onboarding_tasks_select');
    expect(sql).toContain('orbis_onboarding_tasks_insert');
    expect(sql).toContain('orbis_onboarding_tasks_update');
    expect(sql).toContain('orbis_onboarding_tasks_delete');
    expect(sql).not.toMatch(/(using|with check) \(public\.orbis_employee_child_accessible/);
  });
});
