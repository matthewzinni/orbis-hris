/**
 * Employee time clock (qbt-clock Edge Function): clock in / out writes the real QuickBooks Time
 * timesheet. The server decides who the employee is from the login.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabaseClient } from './supabaseClient';

export type TimeClockAction = 'status' | 'clock_in' | 'clock_out';

export type TimeClockState = {
  message: string;
  employee: string;
  onClock: boolean;
  clockedInAt: string | null;
  today: string;
  workedSecondsToday: number;
  /** Browser time when the response arrived, to keep the elapsed counter ticking locally. */
  receivedAt: number;
};

async function describeInvokeFailure(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    try {
      const json = (await res.clone().json()) as { error?: string };
      if (json?.error) return json.error;
    } catch {
      /* fall through */
    }
    if (res.status === 404) return 'The time clock is not set up yet. Tell HR.';
    return `Time clock error (HTTP ${res.status}).`;
  }
  return error instanceof Error ? error.message : 'Could not reach the time clock.';
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

export async function callTimeClock(action: TimeClockAction): Promise<TimeClockState> {
  const { data, error } = await supabaseClient.functions.invoke('qbt-clock', {
    body: { action, tz: browserTimeZone() },
  });
  if (error) throw new Error(await describeInvokeFailure(error));
  const body = (data || {}) as Record<string, unknown>;
  if (body.error) throw new Error(String(body.error));
  return {
    message: String(body.message || ''),
    employee: String(body.employee || ''),
    onClock: Boolean(body.on_clock),
    clockedInAt: body.clocked_in_at ? String(body.clocked_in_at) : null,
    today: String(body.today || ''),
    workedSecondsToday: Number(body.worked_seconds_today || 0),
    receivedAt: Date.now(),
  };
}

/** "3h 05m" */
export function formatWorked(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Local "9:04 AM" for a QuickBooks Time timestamp. */
export function formatClockTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Worked seconds right now, counting forward from the last response while on the clock. */
export function liveWorkedSeconds(state: TimeClockState, now = Date.now()): number {
  if (!state.onClock) return state.workedSecondsToday;
  return state.workedSecondsToday + Math.max(0, Math.floor((now - state.receivedAt) / 1000));
}
