import { supabaseClient } from './supabaseClient';

export function generateEmployeeId(): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const random = Math.floor(10 + Math.random() * 90);
  return `BTW${year}${random}`;
}

function collectUsedIdNumbers(value: unknown, usedNumbers: Set<number>): void {
  const match = String(value || '').match(/(\d+)$/);
  if (match) usedNumbers.add(Number(match[1]));
}

export async function generateAvailableEmployeeId(): Promise<string> {
  const usedNumbers = new Set<number>();

  const employees = window.EMPLOYEES || window.ALL_EMPLOYEES || [];
  if (Array.isArray(employees)) {
    employees.forEach((employee: Record<string, unknown>) => {
      collectUsedIdNumbers(
        employee.employee_id || employee.displayId || employee.id,
        usedNumbers
      );
    });
  }

  try {
    const [employeeRes, onboardingRes] = await Promise.all([
      supabaseClient.from('employees').select('id'),
      supabaseClient.from('onboarding_tasks').select('employee_id'),
    ]);

    if (!employeeRes.error) {
      (employeeRes.data || []).forEach((row: { id?: string }) => {
        collectUsedIdNumbers(row.id, usedNumbers);
      });
    }

    if (!onboardingRes.error) {
      (onboardingRes.data || []).forEach((row: { employee_id?: string }) => {
        collectUsedIdNumbers(row.employee_id, usedNumbers);
      });
    }
  } catch (err) {
    console.warn(
      'Could not check existing employee/onboarding IDs. Falling back to local list.',
      err
    );
  }

  let nextNumber = usedNumbers.size ? Math.max(...Array.from(usedNumbers)) + 1 : 1;
  while (usedNumbers.has(nextNumber)) {
    nextNumber += 1;
  }

  return `BTW${nextNumber}`;
}

declare global {
  interface Window {
    EMPLOYEES?: Record<string, unknown>[];
    ALL_EMPLOYEES?: Record<string, unknown>[];
  }
}
