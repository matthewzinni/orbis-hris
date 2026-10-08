import { supabaseClient } from './supabaseClient';
import type { SigningDocument, SigningDocumentContent } from './signingDocumentModel';

export async function fetchSigningDocuments(): Promise<SigningDocument[]> {
  const { data, error } = await supabaseClient.from('janus_signing_documents').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function saveSigningDocument(content: SigningDocumentContent, signerName: string, signerEmail: string, allowEdits: boolean, id: string | null): Promise<string> {
  const { data, error } = await supabaseClient.rpc('orbis_save_signing_document', { p_content: content, p_signer_name: signerName, p_signer_email: signerEmail, p_allow_edits: allowEdits, p_id: id });
  if (error) throw error;
  return String(data);
}
export async function issueSigningDocumentLink(id: string): Promise<string> {
  const { data, error } = await supabaseClient.rpc('orbis_issue_document_signing_link', { p_id: id });
  if (error || !data?.token) throw error || new Error('Could not create a signing link.');
  const origin = String(import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');
  // A fragment keeps the token out of server request logs and referrers.
  return `${origin}/document-sign.html#${encodeURIComponent(data.token)}`;
}
export async function cancelSigningDocumentLink(id: string): Promise<void> {
  const { error } = await supabaseClient.rpc('orbis_cancel_document_signing_link', { p_id: id });
  if (error) throw error;
}
