/**
 * Batch benefits eligibility sync and local roster patching helpers.
 */

import { isAdminUser } from './access';
import { recordAuditEvent } from './auditTrail';
import {
  AUTO_BENEFITS_ELIGIBLE_STATUS,
  isBenefitsAlreadyAutoEligible,
  isBenefitsStatusAwaitingAutoEligible,
} from './benefitsEligibilityRules';
import {
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

export type BenefitsEligibilitySyncResult = {
  updatedCount: number;
  updatedEmployeeIds: string[];
};

function employeeKey(employee: EmployeeLike): string {
  return String(employee.id || employee.dbId || employee.employee_id || '').trim();
}

async function loadEmployeesWithAutoBenefitsHandoff(employeeIds: string[]): Promise<Set<string>> {
  if (!employeeIds.length) return new Set();

  const { data, error } = await supabaseClient
    .from('payroll_handoffs')
    .select('employee_id')
    .in('employee_id', employeeIds)
    .eq('change_type', 'benefits')
    .contains('payload', { auto_benefits_eligibility: true });

  if (error) {
    console.warn('[BenefitsEligibility] Handoff lookup failed:', error);
    return new Set();
  }

  return new Set(
    (data || [])
      .map((row) => String((row as { employee_id?: string }).employee_id || '').trim())
      .filter(Boolean)
  );
}

async function logBenefitsEligibilityHandoff(
  employee: EmployeeLike,
  previousStatus: string
): Promise<boolean> {
  const employeeId = employeeKey(employee);
  const effectiveDate = getBenefitsEligibilityDateIso(employee);
  if (!employeeId || !effectiveDate) return false;

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

type EligibilityWorkItem = {
  employee: EmployeeLike;
  employeeId: string;
  previousStatus: string;
  needsStatusUpdate: boolean;
  needsHandoff: boolean;
};

function classifyEligibilityWork(employee: EmployeeLike): EligibilityWorkItem | null {
  if (!isActiveDashboardEmployee(employee) || !isBenefitsEligibleEmployee(employee)) {
    return null;
  }

  const employeeId = employeeKey(employee);
  if (!employeeId) return null;

  const previousStatus = String(employee.benefits_status || employee.benefitsStatus || '').trim();
  const needsStatusUpdate = isBenefitsStatusAwaitingAutoEligible(previousStatus);
  const needsHandoff =
    !needsStatusUpdate && isBenefitsAlreadyAutoEligible(previousStatus);

  if (!needsStatusUpdate && !needsHandoff) {
    return null;
  }

  return {
    employee,
    employeeId,
    previousStatus,
    needsStatusUpdate,
    needsHandoff,
  };
}

async function runInChunks<T>(
  items: T[],
  chunkSize: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  for (let index = 0; index < items.length; index += chunkSize) {
    await Promise.all(items.slice(index, index + chunkSize).map((item) => worker(item)));
  }
}

/** Admin-only batch sync after roster load. */
export async function syncAutoBenefitsEligibility(
  employees: EmployeeLike[]
): Promise<BenefitsEligibilitySyncResult> {
  if (!isAdminUser() || syncInFlight) {
    return { updatedCount: 0, updatedEmployeeIds: [] };
  }

  syncInFlight = true;

  try {
    const workItems = employees
      .map((employee) => classifyEligibilityWork(employee))
      .filter((item): item is EligibilityWorkItem => Boolean(item));

    if (!workItems.length) {
      return { updatedCount: 0, updatedEmployeeIds: [] };
    }

    const statusUpdateIds = workItems
      .filter((item) => item.needsStatusUpdate)
      .map((item) => item.employeeId);

    if (statusUpdateIds.length) {
      const { error } = await supabaseClient
        .from('employees')
        .update({ benefits_status: AUTO_BENEFITS_ELIGIBLE_STATUS })
        .in('id', statusUpdateIds);

      if (error) {
        console.warn('[BenefitsEligibility] Batch update failed:', error);
        return { updatedCount: 0, updatedEmployeeIds: [] };
      }

      await runInChunks(
        workItems.filter((item) => item.needsStatusUpdate),
        5,
        async (item) => {
          await recordAuditEvent(
            'Benefits Auto-Eligible',
            item.employee,
            `Benefits status set to ${AUTO_BENEFITS_ELIGIBLE_STATUS} (${BENEFITS_ELIGIBILITY_WAIT_DAYS} days after hire).`
          );
        }
      );
    }

    const handoffCandidates = workItems.filter((item) => item.needsStatusUpdate || item.needsHandoff);
    const existingHandoffs = await loadEmployeesWithAutoBenefitsHandoff(
      handoffCandidates.map((item) => item.employeeId)
    );

    await runInChunks(
      handoffCandidates.filter((item) => !existingHandoffs.has(item.employeeId)),
      5,
      async (item) => {
        try {
          await logBenefitsEligibilityHandoff(item.employee, item.previousStatus);
        } catch (err) {
          console.warn('[BenefitsEligibility] Payroll handoff failed:', item.employeeId, err);
        }
      }
    );

    const updatedEmployeeIds = workItems.map((item) => item.employeeId);
    return {
      updatedCount: updatedEmployeeIds.length,
      updatedEmployeeIds,
    };
  } finally {
    syncInFlight = false;
  }
}

export { isBenefitsStatusAwaitingAutoEligible } from './benefitsEligibilityRules';
