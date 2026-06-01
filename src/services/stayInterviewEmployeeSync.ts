import { supabaseClient } from './supabaseClient';
import {
  computeNextStayInterviewDateFromLast,
  formatStayInterviewScheduleLabel,
} from './stayInterviewSchedule';

function maxIsoDate(left: string | null, right: string | null): string | null {
  const a = String(left || '').trim();
  const b = String(right || '').trim();

  if (!a) return b || null;
  if (!b) return a;
  return a >= b ? a : b;
}

export async function fetchEmployeeNextStayInterviewDate(
  employeeRecordId: string
): Promise<string | null> {
  const recordId = String(employeeRecordId || '').trim();

  if (!recordId) {
    return null;
  }

  const { data, error } = await supabaseClient
    .from('employees')
    .select('next_review_date')
    .eq('id', recordId)
    .maybeSingle();

  if (error) {
    console.warn('[StayInterviews] Could not read next stay interview date:', error);
    return null;
  }

  return String(data?.next_review_date || '').trim() || null;
}

export async function fetchLatestStayInterviewDate(
  employeeIds: string[]
): Promise<string | null> {
  const ids = [...new Set(employeeIds.map((id) => String(id || '').trim()).filter(Boolean))];

  if (!ids.length) {
    return null;
  }

  const { data, error } = await supabaseClient
    .from('stay_interviews')
    .select('interview_date, created_at')
    .in('employee_id', ids)
    .order('interview_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.warn('[StayInterviews] Could not load latest stay interview date:', error);
    return null;
  }

  const row = (data || [])[0] as { interview_date?: string; created_at?: string } | undefined;

  if (!row) {
    return null;
  }

  return String(row.interview_date || row.created_at || '').trim() || null;
}

export async function syncEmployeeNextStayInterviewFromLastDate(
  employeeRecordId: string,
  lastInterviewDate: string
): Promise<{ nextDate: string | null; error: Error | null }> {
  const recordId = String(employeeRecordId || '').trim();
  const lastDate = String(lastInterviewDate || '').trim();

  if (!recordId || !lastDate) {
    return { nextDate: null, error: new Error('Missing employee or interview date') };
  }

  const nextDate = computeNextStayInterviewDateFromLast(lastDate);

  if (!nextDate) {
    return { nextDate: null, error: new Error('Could not calculate next stay interview date') };
  }

  const { error } = await supabaseClient
    .from('employees')
    .update({ next_review_date: nextDate })
    .eq('id', recordId);

  if (error) {
    return { nextDate: null, error: new Error(error.message || 'Employee update failed') };
  }

  return { nextDate, error: null };
}

export async function syncEmployeeNextStayInterviewFromLatestRecord(
  employeeRecordId: string,
  employeeLookupIds: string[]
): Promise<{ nextDate: string | null; error: Error | null }> {
  const latestDate = await fetchLatestStayInterviewDate(employeeLookupIds);

  if (!latestDate) {
    return { nextDate: null, error: null };
  }

  return syncEmployeeNextStayInterviewFromLastDate(employeeRecordId, latestDate);
}

/**
 * After saving a stay interview: compute from the latest interview date, try a direct
 * employee update (admins), then read back from employees (DB trigger works for all roles).
 */
export async function syncEmployeeNextStayInterviewAfterStayInterviewSaved(
  employeeRecordId: string,
  employeeLookupIds: string[],
  savedInterviewDate?: string | null
): Promise<{ nextDate: string | null; error: Error | null }> {
  const latestFromRecords = await fetchLatestStayInterviewDate(employeeLookupIds);
  const saved = String(savedInterviewDate || '').trim();
  const effectiveLast = maxIsoDate(latestFromRecords, saved);

  if (!effectiveLast) {
    return { nextDate: null, error: null };
  }

  await syncEmployeeNextStayInterviewFromLastDate(employeeRecordId, effectiveLast);

  const fromDb = await fetchEmployeeNextStayInterviewDate(employeeRecordId);
  const expected = computeNextStayInterviewDateFromLast(effectiveLast);

  if (fromDb) {
    return { nextDate: fromDb, error: null };
  }

  if (expected) {
    return { nextDate: expected, error: null };
  }

  return { nextDate: null, error: null };
}

export function describeScheduledNextStayInterview(nextDate: string): string {
  return formatStayInterviewScheduleLabel(nextDate);
}
