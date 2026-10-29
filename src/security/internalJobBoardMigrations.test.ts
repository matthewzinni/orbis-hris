import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8');
}

describe('internal job board access migrations', () => {
  it('restricts internal_job_interest updates to staff, not the self-view predicate', () => {
    const sql = readMigration('20261029160000_internal_job_interest_staff_only_update.sql');
    expect(sql).toContain('orbis_internal_job_interest_manageable');
    expect(sql).toContain('orbis_internal_job_interest_update');
    // The manage predicate must not reuse the self-row visibility branch.
    expect(sql).not.toContain('orbis_linked_employee_id');
  });

  it('restricts internal_job_postings updates to a manage predicate, not the browse-visibility one', () => {
    const sql = readMigration('20261029161000_internal_job_postings_manage_predicate.sql');
    expect(sql).toContain('orbis_internal_job_posting_manageable');
    expect(sql).toContain('orbis_internal_job_postings_update');
    // The manage predicate must not reuse the "any employee can browse an open posting" branch.
    expect(sql).not.toContain("orbis_current_role() = 'user'");
  });
});
