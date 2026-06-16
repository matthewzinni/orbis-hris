import { supabaseClient } from './supabaseClient';

export type SignatureFormType = 'discipline' | 'incident' | 'review';
export type SignatureSignerRole = 'employee' | 'manager' | 'witness';

export type CreateSignatureRequestInput = {
  formType: SignatureFormType;
  recordId: string;
  employeeId: string;
  signerRole: SignatureSignerRole;
  signerName?: string;
  signerEmail?: string;
};

function getSigningFunctionBaseUrl(): string {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  if (!supabaseUrl) {
    throw new Error('Supabase URL is not configured.');
  }
  return `${supabaseUrl}/functions/v1/form-signature`;
}

function getPublicAppOrigin(): string {
  const configured = String(import.meta.env.VITE_PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  return String(window.location.origin || '').replace(/\/$/, '');
}

export function buildPublicSigningUrl(token: string): string {
  return `${getPublicAppOrigin()}/sign.html?token=${encodeURIComponent(token)}`;
}

function isSignatureRequestExpired(expiresAt: string | null | undefined): boolean {
  const raw = String(expiresAt || '').trim();
  if (!raw) return false;
  const expires = new Date(raw);
  return !Number.isNaN(expires.getTime()) && expires.getTime() <= Date.now();
}

type PendingSignatureRequestRow = {
  id: string;
  token: string;
  record_id?: string;
  expires_at?: string;
};

async function findPendingEmployeeSignatureRequest(
  input: CreateSignatureRequestInput
): Promise<PendingSignatureRequestRow | null> {
  const { data, error } = await supabaseClient
    .from('signature_requests')
    .select('id, token, record_id, expires_at, created_at')
    .eq('employee_id', input.employeeId)
    .eq('form_type', input.formType)
    .eq('signer_role', input.signerRole)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.token) {
    return null;
  }

  if (isSignatureRequestExpired(data.expires_at)) {
    return null;
  }

  return {
    id: String(data.id),
    token: String(data.token),
    record_id: data.record_id ? String(data.record_id) : undefined,
    expires_at: data.expires_at ? String(data.expires_at) : undefined,
  };
}

async function cancelDuplicatePendingSignatureRequests(
  input: CreateSignatureRequestInput,
  keepRequestId: string
): Promise<void> {
  const { error } = await supabaseClient
    .from('signature_requests')
    .update({ status: 'cancelled' })
    .eq('employee_id', input.employeeId)
    .eq('form_type', input.formType)
    .eq('signer_role', input.signerRole)
    .eq('status', 'pending')
    .neq('id', keepRequestId);

  if (error) {
    console.warn('[SignatureRequests] Could not cancel duplicate pending requests:', error);
  }
}

export async function createSignatureRequest(
  input: CreateSignatureRequestInput
): Promise<{ token: string; signingUrl: string; reused: boolean }> {
  const existing = await findPendingEmployeeSignatureRequest(input);
  if (existing) {
    const recordId = String(input.recordId || '').trim();
    const needsRecordUpdate = recordId && existing.record_id !== recordId;

    if (needsRecordUpdate) {
      const { error: updateError } = await supabaseClient
        .from('signature_requests')
        .update({
          record_id: recordId,
          signer_name: input.signerName || null,
          signer_email: input.signerEmail || null,
        })
        .eq('id', existing.id)
        .eq('status', 'pending');

      if (updateError) {
        throw new Error(updateError.message || 'Could not update the pending signing request.');
      }
    }

    await cancelDuplicatePendingSignatureRequests(input, existing.id);

    const token = String(existing.token);
    return {
      token,
      signingUrl: buildPublicSigningUrl(token),
      reused: true,
    };
  }

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();

  const payload = {
    form_type: input.formType,
    record_id: input.recordId,
    employee_id: input.employeeId,
    signer_role: input.signerRole,
    signer_name: input.signerName || null,
    signer_email: input.signerEmail || null,
    status: 'pending',
    created_by: user?.email || null,
  };

  const { data, error } = await supabaseClient
    .from('signature_requests')
    .insert([payload])
    .select('id, token')
    .single();

  if (error || !data?.token) {
    throw new Error(error?.message || 'Could not create signing request.');
  }

  await cancelDuplicatePendingSignatureRequests(input, String(data.id));

  const token = String(data.token);
  return {
    token,
    signingUrl: buildPublicSigningUrl(token),
    reused: false,
  };
}

export async function copySigningLink(url: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }

  const input = document.createElement('input');
  input.value = url;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

export function getFormSignatureFunctionUrl(token: string): string {
  return `${getSigningFunctionBaseUrl()}?token=${encodeURIComponent(token)}`;
}

export function getEdgeFunctionHeaders(): Record<string, string> {
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (anonKey) {
    headers.apikey = anonKey;
    headers.Authorization = `Bearer ${anonKey}`;
  }

  return headers;
}
