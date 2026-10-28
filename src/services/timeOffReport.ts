import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabaseClient } from './supabaseClient';

export type TimeOffReportRecipients = 'leadership' | 'me';

export type TimeOffReportResult = {
  weekStart: string;
  weekEnd: string;
  approved: number;
  pending: number;
  recipients: number;
};

export class TimeOffReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeOffReportError';
  }
}

async function describeInvokeFailure(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    try {
      const json = (await res.clone().json()) as { error?: string };
      if (json?.error) return json.error;
    } catch {
      /* fall through */
    }
    if (res.status === 404) {
      return 'The send-time-off-report function is not deployed yet. Run: npx supabase functions deploy send-time-off-report';
    }
    return `Edge function HTTP ${res.status}.`;
  }
  return error instanceof Error ? error.message : 'Could not reach the time off report service.';
}

/** Monday (YYYY-MM-DD) of the week containing `date`, using the browser's local date. */
export function mondayOfWeek(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export async function sendTimeOffReport(options: {
  recipients: TimeOffReportRecipients;
  weekOf: string;
}): Promise<TimeOffReportResult> {
  const { data, error } = await supabaseClient.functions.invoke('send-time-off-report', {
    body: { recipients: options.recipients, week_of: options.weekOf },
  });

  if (error) throw new TimeOffReportError(await describeInvokeFailure(error));

  const body = (data || {}) as {
    error?: string;
    week_start?: string;
    week_end?: string;
    approved?: number;
    pending?: number;
    recipients?: number;
  };
  if (body.error) throw new TimeOffReportError(body.error);

  return {
    weekStart: String(body.week_start || options.weekOf),
    weekEnd: String(body.week_end || ''),
    approved: Number(body.approved || 0),
    pending: Number(body.pending || 0),
    recipients: Number(body.recipients || 0),
  };
}
