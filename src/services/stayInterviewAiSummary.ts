import {
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import { supabaseClient } from './supabaseClient';
import type { StayInterviewSummaryContext } from './stayInterviewSummary';

export class StayInterviewAiError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'StayInterviewAiError';
    this.code = code;
  }
}

type InvokeResponse = {
  summary?: string;
  error?: string;
};

async function describeInvokeFailure(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const status = res.status;
    let detail = '';
    try {
      const contentType = res.headers.get('content-type') || '';
      const clone = res.clone();
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
    const suffix = detail ? `: ${detail}` : '.';
    return `Edge function HTTP ${status}${suffix}`;
  }

  if (error instanceof FunctionsRelayError) {
    return 'Supabase relay error (could not run the edge function). Try again or check Supabase status.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Could not reach AI summary service.';
}

/**
 * Calls Supabase Edge Function `summarize-stay-interview` (OpenAI key stays on server).
 */
export async function requestStayInterviewAiSummary(
  context: StayInterviewSummaryContext
): Promise<string> {
  const { data, error } = await supabaseClient.functions.invoke('summarize-stay-interview', {
    body: context,
  });

  if (error) {
    throw new StayInterviewAiError(await describeInvokeFailure(error));
  }

  const payload = (data || {}) as InvokeResponse;

  if (payload.error) {
    throw new StayInterviewAiError(payload.error);
  }

  const summary = String(payload.summary || '').trim();
  if (!summary) {
    throw new StayInterviewAiError('AI returned an empty summary.');
  }

  return summary;
}
