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

export function buildPublicSigningUrl(token: string): string {
  const origin = String(window.location.origin || '').replace(/\/$/, '');
  return `${origin}/sign.html?token=${encodeURIComponent(token)}`;
}

export async function createSignatureRequest(
  input: CreateSignatureRequestInput
): Promise<{ token: string; signingUrl: string }> {
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
    .select('token')
    .single();

  if (error || !data?.token) {
    throw new Error(error?.message || 'Could not create signing request.');
  }

  const token = String(data.token);
  return {
    token,
    signingUrl: buildPublicSigningUrl(token),
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
