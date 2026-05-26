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
    throw new StayInterviewAiError(error.message || 'Could not reach AI summary service.');
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
