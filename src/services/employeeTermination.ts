/**
 * Shared employee termination workflow (Terminate button + admin status save).
 */

import { createDefaultOffboardingTasks } from '../modules/offboarding';
import { employeeDisplayName } from './employeeUtils';
import { supabaseClient } from './supabaseClient';
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

export async function revokeOrbisAccessForTerminatedEmployee(
  employeeId: string
): Promise<{ revokedCount: number; warning: string | null }> {
  const id = normalize(employeeId);
  if (!id) {
    return { revokedCount: 0, warning: null };
  }

  const { data, error } = await supabaseClient.rpc('orbis_revoke_portal_access_for_employee', {
    p_employee_id: id,
  });

  if (error) {
    console.warn('[Termination] Portal access revoke failed:', error);
    return {
      revokedCount: 0,
      warning: 'Orbis login access could not be revoked automatically.',
    };
  }

  const revokedCount = Number(data ?? 0);
  if (!Number.isFinite(revokedCount) || revokedCount < 0) {
    return { revokedCount: 0, warning: null };
  }

  return { revokedCount, warning: null };
}

export async function runEmployeeTerminationSideEffects(input: {
  employeeId: string;
  employee?: Record<string, unknown> | null;
  payrollBefore?: Record<string, unknown>;
  payrollAfter?: Record<string, unknown>;
}): Promise<{ offboardingReady: boolean; payrollHandoffs: number; warnings: string[] }> {
  const employeeId = normalize(input.employeeId);
  if (!employeeId) {
    return { offboardingReady: false, payrollHandoffs: 0, warnings: [] };
  }

  const warnings: string[] = [];

  const { revokedCount, warning: revokeWarning } =
    await revokeOrbisAccessForTerminatedEmployee(employeeId);
  if (revokeWarning) {
    warnings.push(revokeWarning);
  } else if (revokedCount > 0) {
    console.info(
      `[Termination] Revoked Orbis access for ${revokedCount} login account${revokedCount === 1 ? '' : 's'}.`
    );
  }

  let offboardingReady = false;
  try {
    await createDefaultOffboardingTasks(employeeId);
    offboardingReady = true;
  } catch (err) {
    console.warn('[Termination] Offboarding tasks failed:', err);
    warnings.push('Offboarding checklist could not be created.');
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
      warnings.push('Payroll handoff could not be logged.');
    }
  }

  const { refreshDerivedUiProfile } = await import('./derivedDataRefresh');
  await refreshDerivedUiProfile('employeeLifecycle');

  return { offboardingReady, payrollHandoffs, warnings };
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
