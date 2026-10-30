import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8');
}

describe('candidate-resumes storage department-scope migration', () => {
  const sql = readMigration('20261029167000_candidate_resumes_storage_department_scope.sql');

  it('ties resume object visibility back to the candidate row via the leading path segment', () => {
    expect(sql).toContain('orbis_candidate_resume_object_visible');
    expect(sql).toContain('storage.foldername(object_name)');
    expect(sql).toContain('orbis_candidate_row_visible(c)');
  });

  it('applies the scoped check to select/insert/update, not just a bare admin-or-supervisor check', () => {
    expect(sql).not.toMatch(
      /using \(\s*bucket_id = 'candidate-resumes'\s*and \(public\.orbis_is_admin\(\) or public\.orbis_is_supervisor\(\)\)/
    );
    const scopedUses = sql.match(/orbis_candidate_resume_object_visible\(name\)/g) || [];
    expect(scopedUses.length).toBeGreaterThanOrEqual(4);
  });

  it('leaves delete admin-only, unchanged from the original policy', () => {
    expect(sql).toMatch(/orbis_candidate_resumes_storage_delete[\s\S]*?using \(\s*bucket_id = 'candidate-resumes'\s*and public\.orbis_is_admin\(\)\s*\)/);
  });
});
