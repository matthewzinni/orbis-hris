import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8');
}

describe('qbt attendance schema migration', () => {
  const sql = readMigration('20261029200000_qbt_attendance_schema.sql');

  it('adds qbt_user_id and scheduled_start_time to employees', () => {
    expect(sql).toContain('add column if not exists qbt_user_id text');
    expect(sql).toContain('add column if not exists scheduled_start_time time');
  });

  it('enforces qbt_user_id uniqueness among non-null values', () => {
    expect(sql).toMatch(/create unique index if not exists employees_qbt_user_id_unique_idx[\s\S]*where qbt_user_id is not null/);
  });

  it('creates attendance_live_status restricted to the four defined statuses', () => {
    expect(sql).toContain("check (status in ('on_clock', 'worked_clocked_out', 'manual_entry', 'no_punch'))");
  });

  it('scopes SELECT via the existing attendance access helpers, not a new predicate', () => {
    expect(sql).toContain('orbis_has_org_wide_attendance_access()');
    expect(sql).toContain('orbis_attendance_employee_accessible(employee_id)');
  });

  it('restricts writes to service_role only -- no interactive user path', () => {
    expect(sql).toMatch(/orbis_attendance_live_status_service_write[\s\S]*to service_role/);
    expect(sql).not.toMatch(/for (insert|update|delete)[\s\S]*to authenticated/);
  });
});

describe('qbt attendance cron migration', () => {
  const sql = readMigration('20261029210000_qbt_attendance_cron.sql');

  it('enables pg_cron and pg_net', () => {
    expect(sql).toContain('create extension if not exists pg_cron');
    expect(sql).toContain('create extension if not exists pg_net');
  });

  it('schedules a 5-minute job', () => {
    expect(sql).toContain("'*/5 * * * *'");
  });

  it('references secrets by name via Vault, never a literal URL or token', () => {
    expect(sql).toContain("where name = 'qbt_attendance_function_url'");
    expect(sql).toContain("where name = 'attendance_sync_secret'");
    expect(sql).not.toMatch(/https:\/\/[a-z0-9]+\.supabase\.co/);
    expect(sql).not.toContain('service_role_key');
  });

  it('unschedules any prior job of the same name first, guarded against a missing job', () => {
    expect(sql).toContain("perform cron.unschedule('sync-qbt-attendance-5min')");
    expect(sql).toMatch(/exception when others then/);
  });
});
