import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8');
}

describe('internal_job_posting_events actor-guard migration', () => {
  const sql = readMigration('20261029168000_internal_job_posting_events_actor_guard.sql');

  it('requires actor_email to match the caller\'s own auth email', () => {
    expect(sql).toContain('orbis_internal_job_posting_events_insert');
    expect(sql).toContain('lower(trim(actor_email)) = public.orbis_auth_email()');
  });

  it('keeps the existing visibility check alongside the new actor guard', () => {
    expect(sql).toContain('orbis_internal_job_posting_visible(p)');
  });
});
