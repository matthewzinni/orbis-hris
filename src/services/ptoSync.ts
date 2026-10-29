import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabaseClient } from './supabaseClient';

export type PtoSyncMatch = {
  employee_id: string;
  name: string;
  hours: number;
  previous: number | null;
  how: string;
  breakdown: Record<string, number>;
};

export type PtoSyncResult = {
  dryRun: boolean;
  asOf: string;
  qbtUsers: number;
  updated: number;
  matched: PtoSyncMatch[];
  unmatched: { name: string; email: string; reason: string }[];
  activeWithoutQbtMatch: string[];
};

export class PtoSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PtoSyncError';
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
      return 'The sync-qbt-pto function is not deployed yet. Run: npx supabase functions deploy sync-qbt-pto';
    }
    return `Edge function HTTP ${res.status}.`;
  }
  return error instanceof Error ? error.message : 'Could not reach the PTO sync service.';
}

/** Pull remaining PTO from QuickBooks Time. dryRun=true previews matches without writing. */
export async function syncPtoFromQuickBooksTime(options: { dryRun: boolean }): Promise<PtoSyncResult> {
  const { data, error } = await supabaseClient.functions.invoke('sync-qbt-pto', {
    body: { dry_run: options.dryRun },
  });
  if (error) throw new PtoSyncError(await describeInvokeFailure(error));

  const body = (data || {}) as Record<string, unknown> & { error?: string };
  if (body.error) throw new PtoSyncError(String(body.error));

  return {
    dryRun: Boolean(body.dry_run),
    asOf: String(body.as_of || ''),
    qbtUsers: Number(body.qbt_users || 0),
    updated: Number(body.updated || 0),
    matched: (body.matched as PtoSyncMatch[]) || [],
    unmatched: (body.unmatched as PtoSyncResult['unmatched']) || [],
    activeWithoutQbtMatch: (body.active_without_qbt_match as string[]) || [],
  };
}
