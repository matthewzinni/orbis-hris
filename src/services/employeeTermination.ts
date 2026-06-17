/**
 * Shared employee termination workflow (Terminate button + admin status save).
 */

import { createDefaultOffboardingTasks } from '../modules/offboarding';
import { employeeDisplayName } from './employeeUtils';
export {
  applyNewTerminationFieldsToPayload,
  buildTerminationUpdatePayload,
  type TerminationFieldsInput,
} from './employeeTerminationFields';
import {
  employeeToPayrollSnapshot,
  logPayrollHandoffsFromEmployeeSave,
} from './payrollHandoff';

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

export async function runEmployeeTerminationSideEffects(input: {
  employeeId: string;
  employee?: Record<string, unknown> | null;
  payrollBefore?: Record<string, unknown>;
  payrollAfter?: Record<string, unknown>;
}): Promise<{ offboardingReady: boolean; payrollHandoffs: number }> {
  const employeeId = normalize(input.employeeId);
  if (!employeeId) {
    return { offboardingReady: false, payrollHandoffs: 0 };
  }

  let offboardingReady = false;
  try {
    await createDefaultOffboardingTasks(employeeId);
    offboardingReady = true;
  } catch (err) {
    console.warn('[Termination] Offboarding tasks failed:', err);
  }

  let payrollHandoffs = 0;
  if (input.payrollBefore && input.payrollAfter) {
    try {
      payrollHandoffs = await logPayrollHandoffsFromEmployeeSave({
        employeeId,
        employee: input.employee,
        before: input.payrollBefore,
        after: input.payrollAfter,
      });
    } catch (err) {
      console.warn('[Termination] Payroll handoff failed:', err);
    }
  }

  if (typeof window.loadHrInbox === 'function') {
    void window.loadHrInbox(true);
  }

  return { offboardingReady, payrollHandoffs };
}

export function employeeTerminationDisplayName(
  employee: Record<string, unknown> | null | undefined
): string {
  const name = employeeDisplayName(employee || {});
  return name || 'this employee';
}

export function payrollSnapshotAfterTermination(
  employee: Record<string, unknown> | null | undefined,
  terminationFields: Record<string, unknown>
): Record<string, unknown> {
  return employeeToPayrollSnapshot({
    ...(employee || {}),
    ...terminationFields,
  });
}
