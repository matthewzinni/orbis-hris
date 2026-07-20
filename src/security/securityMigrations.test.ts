import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8');
}

describe('security migrations', () => {
  it('restricts employee_notes to HR staff on direct reports', () => {
    const sql = readMigration('20260706170000_employee_notes_hr_only.sql');

    expect(sql).toContain('orbis_hr_staff_child_accessible');
    expect(sql).toContain('orbis_employee_notes_select');
    expect(sql).toContain('orbis_employee_notes_insert');
    expect(sql).toContain('orbis_employee_notes_update');
    expect(sql).toContain('orbis_employee_notes_delete');
    expect(sql).toContain('orbis_is_supervisor()');
    expect(sql).not.toContain('orbis_is_employee()');
  });

  it('revokes portal access when an employee is terminated', () => {
    const sql = readMigration('20260706180000_revoke_access_on_termination.sql');

    expect(sql).toContain("approval_status = 'rejected'");
    expect(sql).toContain('orbis_revoke_portal_access_for_employee_internal');
    expect(sql).toContain("upper(trim(coalesce(NEW.status, ''))) = 'TERMINATED'");
    expect(sql).toContain('orbis_access_is_approved');
  });

  it('blocks supervisors from changing payroll and termination fields', () => {
    const sql = readMigration('20260706190000_supervisor_employee_update_guard.sql');

    expect(sql).toContain('orbis_guard_supervisor_employee_update');
    expect(sql).toContain('NEW.status is distinct from OLD.status');
    expect(sql).toContain('NEW.termination_date is distinct from OLD.termination_date');
    expect(sql).toContain('NEW.pay_type is distinct from OLD.pay_type');
    expect(sql).toContain('Supervisors cannot modify payroll, status, or termination fields');
  });

  it('guards profiles.hr_role escalation in security hardening migration', () => {
    const sql = readMigration('20260706140000_security_profiles_document_library_storage.sql');

    expect(sql).toContain('orbis_profiles_guard_hr_role');
    expect(sql).toContain('Only administrators may change hr_role');
    expect(sql).toContain('document_library');
  });

  it('documents admin and supervisor access to candidate resume storage folders', () => {
    const sql = readMigration('20260707140000_candidate_resume_admin_storage.sql');

    expect(sql).toContain('orbis_can_access_candidate_resume_storage');
    expect(sql).toContain('orbis_is_admin()');
    expect(sql).toContain('orbis_is_supervisor()');
    expect(sql).toContain('orbis_candidate_resumes_storage_select');
  });

  it('restricts banked PTO baseline edits to Matthew only', () => {
    const sql = readMigration('20260708120000_pto_balance_matthew_only.sql');

    expect(sql).toContain('orbis_can_adjust_pto_balance');
    expect(sql).toContain('matthew.zinni@btwglobal.com');
    expect(sql).toContain('orbis_guard_pto_balance_update');
    expect(sql).toContain('Only Matthew can adjust banked PTO hours');
  });

  it('splits stay interview due dates from performance next_review_date', () => {
    const sql = readMigration('20260720153000_split_stay_interview_due_date.sql');

    expect(sql).toContain('next_stay_interview_date');
    expect(sql).toContain('set next_stay_interview_date = next_due');
    expect(sql).not.toContain('set next_review_date = next_due');
  });

  it('fixes linked_discipline_report_id to bigint FK', () => {
    const sql = readMigration('20260720153100_fix_linked_discipline_report_id.sql');

    expect(sql).toContain('linked_discipline_report_id bigint');
    expect(sql).toContain('references public.discipline_reports(id)');
  });

  it('restricts incident_reports to HR staff', () => {
    const sql = readMigration('20260720153200_incident_reports_hr_only.sql');

    expect(sql).toContain('orbis_hr_staff_child_accessible');
    expect(sql).toContain('orbis_incident_reports_select');
    expect(sql).not.toContain('orbis_employee_child_accessible');
  });

  it('enables RLS on previously unprotected baseline tables', () => {
    const sql = readMigration('20260720153300_enable_rls_baseline_unprotected.sql');

    expect(sql).toContain('job_requisitions enable row level security');
    expect(sql).toContain('candidate_interviews enable row level security');
    expect(sql).toContain('onboarding_templates enable row level security');
    expect(sql).toContain('separation_log enable row level security');
  });
});
