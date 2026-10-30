import type { LiveAttendanceStatus } from './attendanceLiveStatus';

const ET_TIME_ZONE = 'America/New_York';

export function attendanceDateEt(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ET_TIME_ZONE }).format(date);
}

export function nowTimeOfDayEt(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ET_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date).replace(/[^\d:]/g, '');
}

export function isNoPunchAbsent(
  status: LiveAttendanceStatus,
  scheduledStartTime: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (status !== 'no_punch') return false;
  const scheduled = String(scheduledStartTime || '').trim();
  if (!scheduled) return false;
  return nowTimeOfDayEt(now) >= scheduled;
}

export type AttendanceKpiPerson = {
  liveStatus?: LiveAttendanceStatus;
  scheduledStartTime?: string | null;
  onLeave?: boolean;
  manualPresent: boolean;
  manualAbsent: boolean;
};

/** Count each roster member once. A recorded workday wins over old manual marks. */
export function countAttendanceKpis(
  people: AttendanceKpiPerson[],
  now: Date = new Date()
): { present: number; absent: number } {
  let present = 0;
  let absent = 0;
  for (const person of people) {
    if ((person.liveStatus && person.liveStatus !== 'no_punch') || person.manualPresent) {
      present++;
    } else if (person.onLeave) {
      continue;
    } else if (person.liveStatus && isNoPunchAbsent(person.liveStatus, person.scheduledStartTime, now)) {
      absent++;
    } else if (person.manualAbsent) {
      absent++;
    }
  }
  return { present, absent };
}
