import { supabaseClient } from './supabaseClient';
import { resolveInvestigatorEmail } from './investigationsAccess';
import type { InvestigationEvidence } from '../types/investigationsTypes';

const INVESTIGATIONS_BUCKET = 'investigations-evidence';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function loadInvestigationEvidence(
  investigationId: string
): Promise<InvestigationEvidence[]> {
  const { data, error } = await supabaseClient
    .from('investigation_evidence')
    .select('*')
    .eq('investigation_id', investigationId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Investigations] Could not load evidence:', error);
    return [];
  }

  return (data || []) as InvestigationEvidence[];
}

export async function uploadInvestigationEvidenceFile(
  investigationId: string,
  file: File,
  title?: string
): Promise<void> {
  const email = await resolveInvestigatorEmail();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${investigationId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(INVESTIGATIONS_BUCKET)
    .upload(filePath, file, { cacheControl: '3600', upsert: false });

  if (uploadError) {
    throw uploadError;
  }

  const { error: insertError } = await supabaseClient.from('investigation_evidence').insert({
    investigation_id: investigationId,
    evidence_type: 'file',
    title: String(title || file.name).trim() || file.name,
    file_name: file.name,
    file_path: filePath,
    mime_type: file.type || null,
    file_size: file.size,
    uploaded_by_email: email || null,
  });

  if (insertError) {
    throw insertError;
  }
}

export async function addInvestigationEvidenceLink(
  investigationId: string,
  payload: {
    evidence_type: string;
    title: string;
    external_url?: string;
    linked_record_id?: string;
    linked_record_type?: string;
  }
): Promise<void> {
  const email = await resolveInvestigatorEmail();

  const { error } = await supabaseClient.from('investigation_evidence').insert({
    investigation_id: investigationId,
    evidence_type: payload.evidence_type,
    title: payload.title,
    external_url: payload.external_url || null,
    linked_record_id: payload.linked_record_id || null,
    linked_record_type: payload.linked_record_type || null,
    uploaded_by_email: email || null,
  });

  if (error) {
    throw error;
  }
}

export async function deleteInvestigationEvidence(
  evidence: InvestigationEvidence
): Promise<void> {
  if (!evidence.id) return;

  if (evidence.file_path) {
    const { error: storageError } = await supabaseClient.storage
      .from(INVESTIGATIONS_BUCKET)
      .remove([evidence.file_path]);

    if (storageError) {
      console.warn('[Investigations] Storage delete warning:', storageError);
    }
  }

  const { error } = await supabaseClient
    .from('investigation_evidence')
    .delete()
    .eq('id', evidence.id);

  if (error) {
    throw error;
  }
}

export async function getInvestigationEvidenceDownloadUrl(
  filePath: string
): Promise<string | null> {
  const { data, error } = await supabaseClient.storage
    .from(INVESTIGATIONS_BUCKET)
    .createSignedUrl(filePath, 3600);

  if (error) {
    console.warn('[Investigations] Signed URL failed:', error);
    return null;
  }

  return data?.signedUrl || null;
}

export function renderInvestigationEvidence(
  container: HTMLElement | null,
  items: InvestigationEvidence[],
  onDelete?: (item: InvestigationEvidence) => void
): void {
  if (!container) return;

  if (!items.length) {
    container.innerHTML = '<div class="empty">No evidence attached yet.</div>';
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const meta = item.file_name || item.external_url || item.linked_record_id || '';
      return `
        <div class="history-item" data-evidence-id="${escapeHtml(item.id || '')}">
          <div class="history-body">
            <strong>${escapeHtml(item.title || 'Evidence')}</strong>
            <div class="muted">${escapeHtml(String(item.evidence_type || '').replace(/_/g, ' '))}</div>
            ${meta ? `<div class="muted">${escapeHtml(meta)}</div>` : ''}
          </div>
          <div class="table-actions">
            ${
              item.file_path
                ? `<button type="button" class="button soft sm" data-download-evidence-id="${escapeHtml(item.id || '')}">Open</button>`
                : ''
            }
            ${
              onDelete
                ? `<button type="button" class="button danger sm" data-delete-evidence-id="${escapeHtml(item.id || '')}">Remove</button>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll<HTMLButtonElement>('[data-delete-evidence-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.deleteEvidenceId;
      const match = items.find((row) => row.id === id);
      if (match && onDelete) void onDelete(match);
    });
  });

  container.querySelectorAll<HTMLButtonElement>('[data-download-evidence-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.downloadEvidenceId;
      const match = items.find((row) => row.id === id);
      if (!match?.file_path) return;
      const url = await getInvestigationEvidenceDownloadUrl(match.file_path);
      if (url) window.open(url, '_blank', 'noopener');
    });
  });
}
