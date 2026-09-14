import { supabaseClient } from './supabaseClient';
import { buildPublicSigningUrl } from './signatureRequests';

export const HANDBOOK_ACKNOWLEDGMENT_TEXT = 'I acknowledge that I have received and reviewed the BTW Global LLC Employee Handbook. I understand that the handbook is not a contract of employment and that policies may change at any time.';

export type HandbookAcknowledgment = {
  id: string;
  employee_id: string;
  employee_name: string;
  document_title: string;
  acknowledgment_text: string;
  created_at: string;
  signed_at: string | null;
  signer_name: string | null;
  employee_signature: string | null;
};

export async function listHandbookAcknowledgments(employeeId: string): Promise<HandbookAcknowledgment[]> {
  const { data, error } = await supabaseClient.from('handbook_acknowledgment_forms')
    .select('*').eq('employee_id', employeeId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as HandbookAcknowledgment[];
}

export async function createHandbookSigningLink(employeeId: string): Promise<string> {
  const { data, error } = await supabaseClient.rpc('orbis_create_handbook_signature_request', {
    p_employee_id: employeeId,
  });
  if (error || !data?.token) throw new Error(error?.message || 'Could not create the signing link.');
  return buildPublicSigningUrl(String(data.token));
}
