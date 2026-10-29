import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8');
}

describe('candidate_interviews / candidate_offers department-scope migration', () => {
  const sql = readMigration('20261029166000_candidate_offers_interviews_department_scope.sql');

  it('drops the bare admin-or-supervisor policies for both tables', () => {
    expect(sql).toContain('drop policy if exists orbis_candidate_interviews_all');
    expect(sql).toContain('drop policy if exists orbis_candidate_offers_all');
  });

  it('scopes every policy through orbis_candidate_row_visible on the parent candidate row', () => {
    const occurrences = sql.match(/orbis_candidate_row_visible\(c\)/g) || [];
    // select+insert+delete (1 each) + update (using AND with check) = 5 per table x 2 tables.
    expect(occurrences.length).toBe(10);
  });

  it('does not leave a bare is_admin-or-is_supervisor check with no department scoping', () => {
    expect(sql).not.toMatch(/using \(\s*public\.orbis_is_admin\(\)\s*or\s*public\.orbis_is_supervisor\(\)\s*\)/);
  });
});
