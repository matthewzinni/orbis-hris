// Pure decision logic for push-leave-to-qbt (no Deno / network), shared with vitest.

export type LeaveRow = {
  id: string;
  employee_id: string;
  leave_type: string | null;
  start_date: string;
  end_date: string | null;
  hours: number | string | null;
  status: string | null;
  deduct_from_pto_balance: boolean | null;
  qbt_time_off_request_id: number | string | null;
  qbt_sync_status: string | null;
  qbt_sync_signature: string | null;
};

export type QbtEntryDraft = { date: string; duration: number };

export type PushPlan =
  | { action: 'none'; reason: string }
  | { action: 'create'; entries: QbtEntryDraft[]; signature: string }
  | { action: 'cancel'; qbtRequestId: string }
  | { action: 'replace'; qbtRequestId: string; entries: QbtEntryDraft[]; signature: string };

/** Hours assumed per day when an Orbis request has no hours. */
export const DEFAULT_HOURS_PER_DAY = 8;

function isoDays(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(last.getTime())) return out;
  for (let i = 0; d <= last && i < 366; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function isWeekday(iso: string): boolean {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * One QuickBooks Time entry per weekday in the range (every day if the range is only a weekend).
 * Total hours are split evenly; any leftover seconds go on the last day so the total is exact.
 */
export function buildEntries(row: Pick<LeaveRow, 'start_date' | 'end_date' | 'hours'>): QbtEntryDraft[] {
  const start = String(row.start_date || '').slice(0, 10);
  const end = String(row.end_date || '').slice(0, 10) || start;
  const all = isoDays(start, end < start ? start : end);
  const days = all.filter(isWeekday).length ? all.filter(isWeekday) : all;
  if (!days.length) return [];

  const rawHours = row.hours == null || row.hours === '' ? NaN : Number(row.hours);
  const totalHours = Number.isFinite(rawHours) && rawHours > 0 ? rawHours : DEFAULT_HOURS_PER_DAY * days.length;
  const totalSeconds = Math.round(totalHours * 3600);
  const each = Math.floor(totalSeconds / days.length);
  return days.map((date, i) => ({
    date,
    duration: i === days.length - 1 ? totalSeconds - each * (days.length - 1) : each,
  }));
}

export function entriesSignature(entries: QbtEntryDraft[]): string {
  return entries.map((e) => `${e.date}:${e.duration}`).join(',');
}

/** Approved PTO that should exist in QuickBooks Time. */
export function shouldExistInQbt(row: LeaveRow): boolean {
  return (
    String(row.status || '') === 'approved' &&
    String(row.leave_type || '').toLowerCase() === 'pto' &&
    row.deduct_from_pto_balance !== false
  );
}

export function planPush(row: LeaveRow): PushPlan {
  const qbtId = row.qbt_time_off_request_id == null ? '' : String(row.qbt_time_off_request_id);
  const linked = Boolean(qbtId) && row.qbt_sync_status !== 'canceled';

  if (row.qbt_sync_status === 'skipped' && !linked) {
    return { action: 'none', reason: 'skipped' };
  }

  if (!shouldExistInQbt(row)) {
    return linked ? { action: 'cancel', qbtRequestId: qbtId } : { action: 'none', reason: 'not approved PTO' };
  }

  const entries = buildEntries(row);
  if (!entries.length) return { action: 'none', reason: 'no dates' };
  const signature = entriesSignature(entries);

  if (!linked) return { action: 'create', entries, signature };
  if (row.qbt_sync_status === 'synced' && row.qbt_sync_signature === signature) {
    return { action: 'none', reason: 'already synced' };
  }
  return { action: 'replace', qbtRequestId: qbtId, entries, signature };
}
