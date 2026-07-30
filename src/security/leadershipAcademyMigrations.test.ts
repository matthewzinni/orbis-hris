import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8');
}

describe('leadership academy migrations', () => {
  it('creates core catalog, progress, and audit tables with RLS helpers', () => {
    const sql = readMigration('20260729120000_leadership_academy_core.sql');

    expect(sql).toContain('create table if not exists public.leadership_program_tiers');
    expect(sql).toContain('create table if not exists public.leadership_courses');
    expect(sql).toContain('create table if not exists public.leadership_modules');
    expect(sql).toContain('create table if not exists public.leadership_enrollments');
    expect(sql).toContain('create table if not exists public.leadership_audit_events');

    expect(sql).toContain('orbis_can_manage_leadership_academy()');
    expect(sql).toContain('orbis_can_view_leadership_catalog()');
    expect(sql).toContain('orbis_can_view_leadership_employee(emp_id text)');

    expect(sql).toContain('enable row level security');
    expect(sql).toContain('leadership_program_tiers_select');
    expect(sql).toContain('leadership_enrollments_select');
    expect(sql).toContain('leadership_audit_events_insert');
    expect(sql).toContain('create policy leadership_quiz_responses_write on public.leadership_quiz_responses');
  });

  it('scopes leadership grants to academy tables only', () => {
    const sql = readMigration('20260729120000_leadership_academy_core.sql');

    expect(sql).toContain('grant select, insert, update, delete on table public.leadership_program_tiers');
    expect(sql).toContain('grant select, insert on table public.leadership_audit_events');
    expect(sql).not.toContain('grant select, insert, update, delete on all tables in schema public');
  });

  it('uses employee child access for supervisor-scoped enrollment visibility', () => {
    const sql = readMigration('20260729120000_leadership_academy_core.sql');

    expect(sql).toContain('orbis_employee_child_accessible');
    expect(sql).toContain('orbis_linked_employee_id()');
    expect(sql).toContain('orbis_has_personal_portal()');
  });

  it('protects interactive Module 1 submissions and quiz answers', () => {
    const sql = readMigration('20260730110000_leadership_module_one_interactive.sql');
    const quizPayloadFunction = sql.slice(
      sql.indexOf('create or replace function public.get_leadership_quiz'),
      sql.indexOf('create or replace function public.submit_leadership_quiz')
    );

    expect(sql).toContain('create table if not exists public.leadership_module_submissions');
    expect(sql).toContain('if not public.leadership_enrollment_is_writable(p_enrollment_id)');
    expect(sql).toContain(
      'revoke all on function public.submit_leadership_quiz(uuid, uuid, jsonb) from public, anon;'
    );
    expect(quizPayloadFunction).not.toContain("'isCorrect'");
    expect(quizPayloadFunction).not.toContain("'is_correct'");
  });

  it('supports the shared updated-at trigger on course assignments', () => {
    const sql = readMigration(
      '20260730124500_leadership_course_assignment_updated_at.sql'
    );
    expect(sql).toContain('alter table public.leadership_course_assignments');
    expect(sql).toContain('add column if not exists updated_at');
  });

  it('secures enrollment creation and progress reset for administrators', () => {
    const sql = readMigration('20260730150000_leadership_enrollment_management.sql');
    expect(sql).toContain('create_leadership_enrollment');
    expect(sql).toContain('reset_leadership_enrollment_progress');
    expect(sql).toContain('if not public.orbis_can_manage_leadership_academy()');
    expect(sql).toContain('delete from public.leadership_quiz_attempts');
    expect(sql).toContain('from public, anon');
  });
});
