import { parseDueDate } from './employeeUtils';

/** Months after the last completed stay interview to schedule the next one. */
export const STAY_INTERVIEW_SCHEDULE_MONTHS = 6;

export function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function addCalendarMonths(base: Date, months: number): Date {
  const result = new Date(base);
  result.setHours(0, 0, 0, 0);
  result.setMonth(result.getMonth() + months);
  return result;
}

/** Saturday → previous Friday; Sunday → following Monday. */
export function adjustWeekendStayInterviewDate(date: Date): Date {
  const adjusted = new Date(date);
  adjusted.setHours(0, 0, 0, 0);

  const weekday = adjusted.getDay();

  if (weekday === 6) {
    adjusted.setDate(adjusted.getDate() - 1);
  } else if (weekday === 0) {
    adjusted.setDate(adjusted.getDate() + 1);
  }

  return adjusted;
}

export function computeNextStayInterviewDateFromLast(
  lastInterviewDate: unknown
): string | null {
  const parsed = parseDueDate(lastInterviewDate);

  if (!parsed) {
    return null;
  }

  const sixMonthsOut = addCalendarMonths(parsed, STAY_INTERVIEW_SCHEDULE_MONTHS);
  const adjusted = adjustWeekendStayInterviewDate(sixMonthsOut);

  return formatDateForInput(adjusted);
}

export function formatStayInterviewScheduleLabel(isoDate: string): string {
  const parsed = parseDueDate(isoDate);

  if (!parsed) {
    return isoDate;
  }

  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
