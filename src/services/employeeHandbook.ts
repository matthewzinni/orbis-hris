import { supabaseClient } from './supabaseClient';

export type HandbookDocument = {
  id: string;
  title: string;
  category: string;
  description?: string | null;
  file_url: string;
  file_name?: string | null;
  version?: string | null;
  language?: string | null;
  effective_date?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
};

const DOCUMENT_BUCKETS = ['document-library', 'documents'];

function isHandbookDocument(doc: HandbookDocument): boolean {
  const category = String(doc.category || '').trim();
  const title = String(doc.title || '').trim();
  return /handbook/i.test(category) || /handbook/i.test(title);
}

export async function loadHandbookDocuments(): Promise<HandbookDocument[]> {
  const { data, error } = await supabaseClient
    .from('document_library')
    .select(
      'id, title, category, description, file_url, file_name, version, language, effective_date, is_active, created_at'
    )
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Could not load handbook.');
  }

  return ((data || []) as HandbookDocument[]).filter(isHandbookDocument);
}

function getStorageTarget(doc: HandbookDocument): { bucket: string; path: string } {
  if (doc.id.includes('/')) {
    const [bucket, ...pathParts] = doc.id.split('/');
    return { bucket, path: pathParts.join('/') };
  }

  const url = String(doc.file_url || '');
  const marker = '/storage/v1/object/public/';
  if (url.includes(marker)) {
    const afterMarker = url.split(marker)[1]?.split('?')[0] || '';
    const [bucket, ...pathParts] = afterMarker.split('/');
    return { bucket, path: pathParts.join('/') };
  }

  return {
    bucket: 'document-library',
    path: String(doc.file_name || ''),
  };
}

export async function getHandbookDocumentUrl(
  doc: HandbookDocument,
  download = false
): Promise<string | null> {
  const target = getStorageTarget(doc);

  if (target.bucket && target.path) {
    for (const bucket of DOCUMENT_BUCKETS) {
      const { data, error } = await supabaseClient.storage
        .from(bucket)
        .createSignedUrl(target.path, 3600, {
          download: download ? doc.file_name || doc.title : false,
        });

      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }
    }

    const { data, error } = await supabaseClient.storage
      .from(target.bucket)
      .createSignedUrl(target.path, 3600, {
        download: download ? doc.file_name || doc.title : false,
      });

    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  }

  const fileUrl = String(doc.file_url || '').trim();
  return fileUrl || null;
}
