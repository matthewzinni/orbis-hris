import { getCurrentUserAccess } from './access';
import { supabaseClient } from './supabaseClient';
import {
  createJanusDocumentRecord,
  deleteJanusDocumentRecord,
  type JanusDocumentDraft,
} from './janusStore';
import type { JanusDocument } from '../types/janusTypes';

const JANUS_BUCKET = 'janus-documents';

function currentUserEmail(): string | null {
  const email = String(getCurrentUserAccess()?.email || '').trim().toLowerCase();
  return email || null;
}

export async function uploadJanusDocument(
  accountId: string,
  file: File,
  meta: {
    title: string;
    document_type?: JanusDocumentDraft['document_type'];
    effective_date?: string | null;
  }
): Promise<JanusDocument> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${accountId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(JANUS_BUCKET)
    .upload(filePath, file, { cacheControl: '3600', upsert: false });

  if (uploadError) throw uploadError;

  return createJanusDocumentRecord({
    account_id: accountId,
    title: meta.title || file.name,
    file_path: filePath,
    file_name: file.name,
    mime_type: file.type || null,
    document_type: meta.document_type || 'other',
    effective_date: meta.effective_date || null,
  });
}

export async function getJanusDocumentSignedUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabaseClient.storage
    .from(JANUS_BUCKET)
    .createSignedUrl(filePath, 3600);

  if (error) {
    console.warn('[Janus] Could not create signed URL:', error);
    return null;
  }

  return data?.signedUrl || null;
}

export async function deleteJanusDocument(document: JanusDocument): Promise<void> {
  const normalizedPath = String(document.file_path || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/^janus-documents\//, '');

  if (normalizedPath) {
    const { error: storageError } = await supabaseClient.storage
      .from(JANUS_BUCKET)
      .remove([normalizedPath]);
    if (storageError) {
      console.warn('[Janus] Storage delete warning:', storageError);
    }
  }

  await deleteJanusDocumentRecord(document.id);
}

export function formatJanusUploaderLabel(): string {
  return currentUserEmail() || 'Janus user';
}
