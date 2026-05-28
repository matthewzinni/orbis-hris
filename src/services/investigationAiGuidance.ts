import {
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import { supabaseClient } from './supabaseClient';
import type { InvestigationGuidanceContext } from './investigationGuidance';

export class InvestigationAiError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'InvestigationAiError';
    this.code = code;
  }
}

type InvokeResponse = {
  guidance?: string;
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

  return 'Could not reach AI guidance service.';
}

/** Calls Supabase Edge Function `investigation-hr-guidance` (OpenAI key stays on server). */
export async function requestInvestigationAiGuidance(
  context: InvestigationGuidanceContext
): Promise<string> {
  const { data, error } = await supabaseClient.functions.invoke('investigation-hr-guidance', {
    body: context,
  });

  if (error) {
    throw new InvestigationAiError(await describeInvokeFailure(error));
  }

  const payload = (data || {}) as InvokeResponse;

  if (payload.error) {
    throw new InvestigationAiError(payload.error);
  }

  const guidance = String(payload.guidance || '').trim();
  if (!guidance) {
    throw new InvestigationAiError('AI returned empty guidance.');
  }

  return guidance;
}
