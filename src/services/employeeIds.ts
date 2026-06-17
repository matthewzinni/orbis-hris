import { supabaseClient } from './supabaseClient';

/**
 * Employee number prefix by calendar year.
 * BTW26 for 2026 (through end of 2026); BTW27 from 2027 (first assignable: BTW2701).
 */
export function getEmployeeIdPrefix(referenceDate: Date = new Date()): string {
  const year = referenceDate.getFullYear();

  if (year >= 2027) {
    return 'BTW27';
  }

  if (year >= 2026) {
    return 'BTW26';
  }

  return `BTW${String(year).slice(-2)}`;
}

/** Format sequence for display/storage (BTW2701 uses two-digit seq in the 2027 series). */
export function formatEmployeeId(prefix: string, sequence: number): string {
  if (prefix === 'BTW27') {
    return `${prefix}${String(sequence).padStart(2, '0')}`;
  }

  return `${prefix}${sequence}`;
}

function parseEmployeeSequence(id: string, prefix: string): number | null {
  const normalized = String(id || '').trim().toUpperCase();

  if (!normalized.startsWith(prefix)) {
    return null;
  }

  const suffix = normalized.slice(prefix.length);

  if (!/^\d+$/.test(suffix)) {
    return null;
  }

  const sequence = Number(suffix);

  return Number.isFinite(sequence) && sequence > 0 ? sequence : null;
}

function collectUsedSequences(value: unknown, prefix: string, usedSequences: Set<number>): void {
  const sequence = parseEmployeeSequence(String(value || ''), prefix);

  if (sequence != null) {
    usedSequences.add(sequence);
  }
}

function collectIdSources(prefix: string, usedSequences: Set<number>): void {
  const employees = window.EMPLOYEES || window.ALL_EMPLOYEES || [];

  if (Array.isArray(employees)) {
    employees.forEach((employee: Record<string, unknown>) => {
      collectUsedSequences(
        employee.employee_id || employee.displayId || employee.id,
        prefix,
        usedSequences
      );
    });
  }
}

async function collectRemoteSequences(prefix: string, usedSequences: Set<number>): Promise<void> {
  try {
    const [employeeRes, onboardingRes] = await Promise.all([
      supabaseClient.from('employees').select('id'),
      supabaseClient.from('onboarding_tasks').select('employee_id'),
    ]);

    if (!employeeRes.error) {
      (employeeRes.data || []).forEach((row: { id?: string }) => {
        collectUsedSequences(row.id, prefix, usedSequences);
      });
    }

    if (!onboardingRes.error) {
      (onboardingRes.data || []).forEach((row: { employee_id?: string }) => {
        collectUsedSequences(row.employee_id, prefix, usedSequences);
      });
    }
  } catch (err) {
    console.warn(
      '[EmployeeIds] Could not check remote IDs; using local roster only.',
      err
    );
  }
}

function resolveNextSequence(prefix: string, usedSequences: Set<number>): number {
  if (!usedSequences.size) {
    return 1;
  }

  let nextSequence = Math.max(...Array.from(usedSequences)) + 1;

  while (usedSequences.has(nextSequence)) {
    nextSequence += 1;
  }

  return nextSequence;
}

/** @deprecated Use generateAvailableEmployeeId for the next sequential BTW number. */
export function generateEmployeeId(referenceDate: Date = new Date()): string {
  const prefix = getEmployeeIdPrefix(referenceDate);
  return formatEmployeeId(prefix, 1);
}

export async function generateAvailableEmployeeId(
  referenceDate: Date = new Date()
): Promise<string> {
  const prefix = getEmployeeIdPrefix(referenceDate);
  const usedSequences = new Set<number>();

  collectIdSources(prefix, usedSequences);
  await collectRemoteSequences(prefix, usedSequences);

  const nextSequence = resolveNextSequence(prefix, usedSequences);

  return formatEmployeeId(prefix, nextSequence);
}

function isDuplicateEmployeeIdError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return /duplicate key|unique constraint/i.test(String(error.message || ''));
}

/** Insert a new employee, retrying with the next available ID on duplicate-key conflicts. */
export async function insertEmployeeRecordWithRetry<T extends Record<string, unknown>>(
  payload: T,
  maxAttempts = 3
): Promise<{
  data: T[] | null;
  error: { message?: string; code?: string } | null;
  employeeId: string;
}> {
  let employeeId = String(payload.id || '').trim();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!employeeId) {
      employeeId = await generateAvailableEmployeeId();
    }

    const attemptPayload = { ...payload, id: employeeId };
    const { data, error } = await supabaseClient
      .from('employees')
      .insert([attemptPayload])
      .select();

    if (!error) {
      return {
        data: (data || []) as T[],
        error: null,
        employeeId,
      };
    }

    if (!isDuplicateEmployeeIdError(error) || attempt === maxAttempts - 1) {
      return { data: null, error, employeeId };
    }

    employeeId = await generateAvailableEmployeeId();
  }

  return {
    data: null,
    error: { message: 'Could not allocate a unique employee ID.' },
    employeeId,
  };
}

window.generateAvailableEmployeeId = () => generateAvailableEmployeeId();
