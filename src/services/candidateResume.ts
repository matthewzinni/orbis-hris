import { supabaseClient } from './supabaseClient';

export const CANDIDATE_RESUME_BUCKET = 'candidate-resumes';
const FALLBACK_RESUME_BUCKET = 'documents';

const RESUME_ACCEPT =
  '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

function resolveContentType(file: File): string {
  const fromFile = String(file.type || '').trim();
  if (fromFile && fromFile !== 'application/octet-stream') {
    return fromFile;
  }

  const ext = String(file.name || '')
    .split('.')
    .pop()
    ?.toLowerCase();

  return (ext && MIME_BY_EXTENSION[ext]) || 'application/octet-stream';
}

/** Stored as `bucket:relative/path` or legacy `uuid/file.ext` or invalid bare filename. */
export function parseResumeReference(value: unknown): { bucket: string; path: string } | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    for (const bucket of [CANDIDATE_RESUME_BUCKET, FALLBACK_RESUME_BUCKET]) {
      const publicMarker = `/object/public/${bucket}/`;
      const signMarker = `/object/sign/${bucket}/`;
      const publicIdx = raw.indexOf(publicMarker);
      if (publicIdx >= 0) {
        return {
          bucket,
          path: decodeURIComponent(raw.slice(publicIdx + publicMarker.length).split('?')[0] || ''),
        };
      }
      const signIdx = raw.indexOf(signMarker);
      if (signIdx >= 0) {
        return {
          bucket,
          path: decodeURIComponent(raw.slice(signIdx + signMarker.length).split('?')[0] || ''),
        };
      }
    }
    return null;
  }

  const bucketPrefix = raw.indexOf(':');
  if (bucketPrefix > 0) {
    const bucket = raw.slice(0, bucketPrefix).trim();
    const path = raw.slice(bucketPrefix + 1).replace(/^\/+/, '');
    if (bucket && path.includes('/')) {
      return { bucket, path };
    }
  }

  if (raw.includes('/')) {
    return { bucket: CANDIDATE_RESUME_BUCKET, path: raw.replace(/^\/+/, '') };
  }

  return null;
}

export function isResumeReferenceValid(value: unknown): boolean {
  return Boolean(parseResumeReference(value));
}

export function resumeFileLabel(value: unknown): string {
  const ref = parseResumeReference(value);
  if (!ref) {
    const raw = String(value ?? '').trim();
    return raw || 'Resume';
  }
  const segment = ref.path.split('/').pop() || ref.path;
  return segment.replace(/^\d+_/, '');
}

function formatResumeReference(bucket: string, path: string): string {
  return `${bucket}:${path}`;
}

async function uploadToBucket(
  bucket: string,
  filePath: string,
  file: File
): Promise<{ error: Error | null }> {
  const { error } = await supabaseClient.storage.from(bucket).upload(filePath, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: resolveContentType(file),
  });

  if (!error) return { error: null };
  return { error: new Error(error.message || 'Resume upload failed.') };
}

async function removeFromBucket(bucket: string, path: string): Promise<void> {
  if (!path) return;
  const { error } = await supabaseClient.storage.from(bucket).remove([path]);
  if (error) {
    console.warn('[Candidates] Resume storage delete warning:', error);
  }
}

async function updateCandidateResumeRow(
  candidateId: string,
  reference: string
): Promise<void> {
  const patchWithStatus: Record<string, unknown> = {
    resume_url: reference,
    resume_status: 'Attached',
  };

  let { error } = await supabaseClient.from('candidates').update(patchWithStatus).eq('id', candidateId);

  if (error && String(error.code || '') === 'PGRST204') {
    ({ error } = await supabaseClient
      .from('candidates')
      .update({ resume_url: reference })
      .eq('id', candidateId));
  }

  if (error) {
    throw new Error(error.message || 'Could not save resume on candidate record.');
  }
}

export async function uploadCandidateResume(
  candidateId: string,
  file: File,
  existingValue?: string | null
): Promise<string> {
  const id = String(candidateId || '').trim();
  if (!id) {
    throw new Error('Save the candidate before attaching a resume.');
  }

  const prior = parseResumeReference(existingValue);
  if (prior) {
    await removeFromBucket(prior.bucket, prior.path);
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'resume.pdf';
  const filePath = `${id}/${Date.now()}_${safeName}`;

  let bucket = CANDIDATE_RESUME_BUCKET;
  let uploadResult = await uploadToBucket(bucket, filePath, file);

  if (uploadResult.error) {
    const message = uploadResult.error.message.toLowerCase();
    const tryFallback =
      message.includes('bucket') ||
      message.includes('not found') ||
      message.includes('mime') ||
      message.includes('invalid');

    if (tryFallback) {
      bucket = FALLBACK_RESUME_BUCKET;
      const fallbackPath = `candidate-resumes/${filePath}`;
      uploadResult = await uploadToBucket(bucket, fallbackPath, file);
      if (!uploadResult.error) {
        const reference = formatResumeReference(bucket, fallbackPath);
        await updateCandidateResumeRow(id, reference);
        return reference;
      }
    }

    throw uploadResult.error;
  }

  const reference = formatResumeReference(bucket, filePath);

  try {
    await updateCandidateResumeRow(id, reference);
  } catch (err) {
    await removeFromBucket(bucket, filePath);
    throw err;
  }

  return reference;
}

export async function clearCandidateResume(
  candidateId: string,
  existingValue?: string | null
): Promise<void> {
  const id = String(candidateId || '').trim();
  if (!id) return;

  const prior = parseResumeReference(existingValue);
  if (prior) {
    await removeFromBucket(prior.bucket, prior.path);
  }

  const patchWithStatus: Record<string, unknown> = {
    resume_url: null,
    resume_status: null,
  };

  let { error } = await supabaseClient.from('candidates').update(patchWithStatus).eq('id', id);

  if (error && String(error.code || '') === 'PGRST204') {
    ({ error } = await supabaseClient.from('candidates').update({ resume_url: null }).eq('id', id));
  }

  if (error) {
    throw new Error(error.message || 'Could not remove resume.');
  }
}

export async function getCandidateResumeSignedUrl(
  resumeUrlOrPath: string | null | undefined
): Promise<string | null> {
  const ref = parseResumeReference(resumeUrlOrPath);
  if (!ref) return null;

  const { data, error } = await supabaseClient.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, 3600);

  if (error) {
    console.warn('[Candidates] Could not create resume signed URL:', error);
    return null;
  }

  return data?.signedUrl || null;
}

export async function openCandidateResume(resumeUrlOrPath: string | null | undefined): Promise<void> {
  if (!isResumeReferenceValid(resumeUrlOrPath)) {
    throw new Error('Resume file is missing or was saved in an old format. Attach the file again.');
  }

  const url = await getCandidateResumeSignedUrl(resumeUrlOrPath);
  if (!url) {
    throw new Error('Resume file is not available. Try attaching it again.');
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function getCandidateResumeAcceptAttribute(): string {
  return RESUME_ACCEPT;
}
