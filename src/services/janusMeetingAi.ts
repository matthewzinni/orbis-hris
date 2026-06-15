import { FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { supabaseClient } from './supabaseClient';

export class JanusMeetingAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JanusMeetingAiError';
  }
}

export type JanusMeetingAiContext = {
  accountName: string;
  meetingDate: string;
  title: string;
  attendees: string[];
  transcript: string;
};

export type JanusMeetingAiResult = {
  summary: string;
  action_items: string;
  follow_up_date: string | null;
};

async function describeInvokeFailure(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    let detail = '';
    try {
      const clone = res.clone();
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = (await clone.json()) as { error?: string; message?: string };
        detail =
          (typeof json?.error === 'string' && json.error) ||
          (typeof json?.message === 'string' && json.message) ||
          '';
      } else {
        detail = (await clone.text()).trim().slice(0, 240);
      }
    } catch {
      detail = '';
    }
    return `Edge function HTTP ${res.status}${detail ? `: ${detail}` : '.'}`;
  }

  if (error instanceof FunctionsRelayError) {
    return 'Could not reach the AI summary service.';
  }

  if (error instanceof Error) return error.message;
  return 'Could not reach AI summary service.';
}

function addDaysIso(isoDate: string, days: number): string {
  const parsed = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + days);
    return fallback.toISOString().slice(0, 10);
  }
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** Rule-based fallback when the edge function is unavailable. */
export function buildFallbackMeetingSummary(context: JanusMeetingAiContext): JanusMeetingAiResult {
  const transcript = String(context.transcript || '').trim();
  const lines = transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const preview = lines.slice(0, 8).join(' ');
  const summary = [
    `Meeting with ${context.accountName} on ${context.meetingDate}.`,
    preview.length > 320 ? `${preview.slice(0, 320)}…` : preview || 'Notes captured for the relationship file.',
  ].join(' ');

  return {
    summary,
    action_items: '- Review notes and confirm next steps with the account owner.',
    follow_up_date: addDaysIso(context.meetingDate, 7),
  };
}

export async function requestJanusMeetingSummary(
  context: JanusMeetingAiContext
): Promise<JanusMeetingAiResult> {
  const { data, error } = await supabaseClient.functions.invoke('summarize-janus-meeting', {
    body: {
      accountName: context.accountName,
      meetingDate: context.meetingDate,
      title: context.title,
      attendees: context.attendees,
      transcript: context.transcript,
    },
  });

  if (error) {
    throw new JanusMeetingAiError(await describeInvokeFailure(error));
  }

  const payload = (data || {}) as {
    error?: string;
    summary?: string;
    action_items?: string;
    follow_up_date?: string | null;
  };

  if (payload.error) {
    throw new JanusMeetingAiError(payload.error);
  }

  const summary = String(payload.summary || '').trim();
  if (!summary) {
    throw new JanusMeetingAiError('AI returned an empty summary.');
  }

  return {
    summary,
    action_items: String(payload.action_items || '').trim(),
    follow_up_date: payload.follow_up_date ? String(payload.follow_up_date).slice(0, 10) : null,
  };
}
