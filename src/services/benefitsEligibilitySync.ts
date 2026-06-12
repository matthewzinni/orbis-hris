/**
 * Auto-mark benefits eligible at 90 days from hire and log payroll handoff.
 * Runs when an admin loads the employee roster (idempotent).
 */

import { isAdminUser } from './access';
import { recordAuditEvent } from './auditTrail';
import {
  AUTO_BENEFITS_ELIGIBLE_STATUS,
  BENEFITS_ELIGIBILITY_WAIT_DAYS,
  type EmployeeLike,
  employeeDisplayName,
  getBenefitsEligibilityDateIso,
  isActiveDashboardEmployee,
  isBenefitsEligibleEmployee,
  readEmployeeHireDateRaw,
} from './employeeUtils';
import { createPayrollHandoff } from './payrollHandoff';
import { supabaseClient } from './supabaseClient';

let syncInFlight = false;

function employeeKey(employee: EmployeeLike): string {
  return String(employee.id || employee.dbId || employee.employee_id || '').trim();
}

function normalizeBenefitsStatus(status: unknown): string {
  return String(status || '').trim().toLowerCase();
}

/** Empty or interim labels HR uses before the 90-day mark — safe to overwrite. */
export function isBenefitsStatusAwaitingAutoEligible(status: unknown): boolean {
  const normalized = normalizeBenefitsStatus(status);
  if (!normalized) return true;

  if (normalized === normalizeBenefitsStatus(AUTO_BENEFITS_ELIGIBLE_STATUS)) {
    return false;
  }

  const protectedTokens = ['enroll', 'waiv', 'declin', 'cobra', 'opt out', 'opt-out'];
  if (protectedTokens.some((token) => normalized.includes(token))) {
    return false;
  }

  return true;
}

async function hasAutoBenefitsEligibilityHandoff(employeeId: string): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from('payroll_handoffs')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('change_type', 'benefits')
    .contains('payload', { auto_benefits_eligibility: true })
    .limit(1);

  if (error) {
    console.warn('[BenefitsEligibility] Handoff lookup failed:', error);
    return false;
  }

  return Boolean(data?.length);
}

async function logBenefitsEligibilityHandoff(
  employee: EmployeeLike,
  previousStatus: string
): Promise<boolean> {
  const employeeId = employeeKey(employee);
  const effectiveDate = getBenefitsEligibilityDateIso(employee);
  if (!employeeId || !effectiveDate) return false;

  if (await hasAutoBenefitsEligibilityHandoff(employeeId)) {
    return false;
  }

  const name = employeeDisplayName(employee);
  const row = await createPayrollHandoff({
    employee_id: employeeId,
    change_type: 'benefits',
    effective_date: effectiveDate,
    summary: `Benefits eligible (${BENEFITS_ELIGIBILITY_WAIT_DAYS}-day wait) — ${name}`,
    payload: {
      auto_benefits_eligibility: true,
      field: 'benefits_status',
      from: previousStatus || null,
      to: AUTO_BENEFITS_ELIGIBLE_STATUS,
      hire_date: readEmployeeHireDateRaw(employee),
      eligibility_date: effectiveDate,
    },
  });

  return Boolean(row);
}

async function applyAutoBenefitsEligibilityForEmployee(
  employee: EmployeeLike
): Promise<boolean> {
  if (!isActiveDashboardEmployee(employee) || !isBenefitsEligibleEmployee(employee)) {
    return false;
  }

  const employeeId = employeeKey(employee);
  if (!employeeId) return false;

  const previousStatus = String(employee.benefits_status || employee.benefitsStatus || '').trim();
  const needsStatusUpdate = isBenefitsStatusAwaitingAutoEligible(previousStatus);
  const needsHandoff =
    !needsStatusUpdate &&
    normalizeBenefitsStatus(previousStatus) ===
      normalizeBenefitsStatus(AUTO_BENEFITS_ELIGIBLE_STATUS);

  if (!needsStatusUpdate && !needsHandoff) {
    return false;
  }

  if (needsStatusUpdate) {
    const { error } = await supabaseClient
      .from('employees')
      .update({ benefits_status: AUTO_BENEFITS_ELIGIBLE_STATUS })
      .eq('id', employeeId);

    if (error) {
      console.warn('[BenefitsEligibility] Could not update employee:', employeeId, error);
      return false;
    }

    await recordAuditEvent(
      'Benefits Auto-Eligible',
      employee,
      `Benefits status set to ${AUTO_BENEFITS_ELIGIBLE_STATUS} (${BENEFITS_ELIGIBILITY_WAIT_DAYS} days after hire).`
    );
  }

  try {
    await logBenefitsEligibilityHandoff(employee, previousStatus);
  } catch (err) {
    console.warn('[BenefitsEligibility] Payroll handoff failed:', employeeId, err);
  }

  return true;
}

/** Admin-only batch sync after roster load. Returns count of employees updated. */
export async function syncAutoBenefitsEligibility(
  employees: EmployeeLike[]
): Promise<number> {
  if (!isAdminUser() || syncInFlight) return 0;

  syncInFlight = true;
  let updated = 0;

  try {
    for (const employee of employees) {
      if (await applyAutoBenefitsEligibilityForEmployee(employee)) {
        updated += 1;
      }
    }
  } finally {
    syncInFlight = false;
  }

  return updated;
}
