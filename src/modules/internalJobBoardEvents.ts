import { supabaseClient } from '../services/supabaseClient';
import {
  resolveCurrentUserDisplayName,
  resolveCurrentUserEmail,
} from '../services/internalJobBoardAccess';

export async function recordInternalJobPostingEvent(
  postingId: string,
  eventType: string,
  options: {
    interestId?: string;
    fieldName?: string;
    oldValue?: string;
    newValue?: string;
    note?: string;
  } = {}
): Promise<void> {
  const email = resolveCurrentUserEmail();
  if (!email || !postingId) return;

  const payload = {
    posting_id: postingId,
    interest_id: options.interestId || null,
    event_type: eventType,
    field_name: options.fieldName || null,
    old_value: options.oldValue ?? null,
    new_value: options.newValue ?? null,
    note: options.note || null,
    actor_email: email,
    actor_name: resolveCurrentUserDisplayName(),
  };

  const { error } = await supabaseClient.from('internal_job_posting_events').insert(payload);

  if (error) {
    console.warn('[InternalJobBoard] Could not record event:', error);
  }
}
