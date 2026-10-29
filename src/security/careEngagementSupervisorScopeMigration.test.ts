import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8');
}

describe('care engagement supervisor-scope migration', () => {
  const sql = readMigration('20261029165000_care_engagement_supervisor_scope.sql');

  it('scopes the four per-employee care tables to orbis_employee_child_accessible', () => {
    ['care_follow_ups', 'care_resources_shared', 'care_wellness_check_ins', 'care_recognition'].forEach(
      (tbl) => {
        expect(sql).toContain(tbl);
      }
    );
    expect(sql).toContain('orbis_employee_child_accessible(employee_id)');
  });

  it('does not touch the aggregate tables without an employee_id', () => {
    const arrayLiteralMatch = sql.match(/array\[([\s\S]*?)\]/);
    expect(arrayLiteralMatch).not.toBeNull();
    const tableList = arrayLiteralMatch![1];
    expect(tableList).not.toContain('care_matrix_cells');
    expect(tableList).not.toContain('care_pulse_snapshots');
  });
});
