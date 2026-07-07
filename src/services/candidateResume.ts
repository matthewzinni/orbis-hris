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

type ResumeReference = { bucket: string; path: string };

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

function joinStoragePath(...segments: string[]): string {
  return segments
    .map((segment) => String(segment || '').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

/** Stored as `bucket:relative/path`, `uuid/file.ext`, or legacy bare filename. */
export function parseResumeReference(value: unknown): ResumeReference | null {
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
    if (raw.startsWith(`${FALLBACK_RESUME_BUCKET}/`) || raw.startsWith('candidate-resumes/')) {
      return { bucket: FALLBACK_RESUME_BUCKET, path: raw.replace(/^\/+/, '') };
    }
    return { bucket: CANDIDATE_RESUME_BUCKET, path: raw.replace(/^\/+/, '') };
  }

  return null;
}

export function buildResumeReferenceCandidates(
  resumeUrlOrPath: string | null | undefined,
  candidateId?: string | null
): ResumeReference[] {
  const refs: ResumeReference[] = [];
  const seen = new Set<string>();
  const push = (ref: ResumeReference | null | undefined): void => {
    if (!ref?.bucket || !ref.path) return;
    const key = `${ref.bucket}:${ref.path}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  };

  push(parseResumeReference(resumeUrlOrPath));

  const raw = String(resumeUrlOrPath ?? '').trim();
  const id = String(candidateId ?? '').trim();
  if (!id) return refs;

  if (!parseResumeReference(resumeUrlOrPath) && raw) {
    if (raw.includes('/')) {
      push({ bucket: CANDIDATE_RESUME_BUCKET, path: raw.replace(/^\/+/, '') });
      push({ bucket: FALLBACK_RESUME_BUCKET, path: joinStoragePath('candidate-resumes', raw) });
    } else {
      push({ bucket: CANDIDATE_RESUME_BUCKET, path: joinStoragePath(id, raw) });
      push({
        bucket: FALLBACK_RESUME_BUCKET,
        path: joinStoragePath('candidate-resumes', id, raw),
      });
    }
  }

  return refs;
}

export function isResumeReferenceValid(
  value: unknown,
  candidateId?: string | null
): boolean {
  if (parseResumeReference(value)) return true;
  return Boolean(String(value ?? '').trim() && String(candidateId ?? '').trim());
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

async function updateCandidateResumeRow(candidateId: string, reference: string): Promise<void> {
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
      const fallbackPath = joinStoragePath('candidate-resumes', filePath);
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

async function listLatestResumeFile(
  bucket: string,
  folderPath: string
): Promise<ResumeReference | null> {
  const prefix = String(folderPath || '').replace(/^\/+|\/+$/g, '');
  if (!prefix) return null;

  const { data, error } = await supabaseClient.storage.from(bucket).list(prefix, {
    limit: 100,
    sortBy: { column: 'created_at', order: 'desc' },
  });

  if (error || !data?.length) return null;

  const latestFile = data
    .filter((item) => item.name && item.metadata)
    .sort((left, right) =>
      String(right.created_at || right.name || '').localeCompare(
        String(left.created_at || left.name || '')
      )
    )[0];

  if (!latestFile?.name) return null;

  return {
    bucket,
    path: joinStoragePath(prefix, latestFile.name),
  };
}

async function resolveCandidateResumeReference(
  resumeUrlOrPath: string | null | undefined,
  candidateId?: string | null
): Promise<ResumeReference | null> {
  for (const ref of buildResumeReferenceCandidates(resumeUrlOrPath, candidateId)) {
    const { data, error } = await supabaseClient.storage.from(ref.bucket).createSignedUrl(ref.path, 60);
    if (!error && data?.signedUrl) {
      return ref;
    }
  }

  const id = String(candidateId ?? '').trim();
  if (!id) return null;

  for (const ref of [
    await listLatestResumeFile(CANDIDATE_RESUME_BUCKET, id),
    await listLatestResumeFile(FALLBACK_RESUME_BUCKET, joinStoragePath('candidate-resumes', id)),
  ]) {
    if (!ref) continue;
    const { data, error } = await supabaseClient.storage.from(ref.bucket).createSignedUrl(ref.path, 60);
    if (!error && data?.signedUrl) {
      return ref;
    }
  }

  return null;
}

export async function candidateResumeIsAvailable(
  resumeUrlOrPath: string | null | undefined,
  candidateId?: string | null
): Promise<boolean> {
  return Boolean(await resolveCandidateResumeReference(resumeUrlOrPath, candidateId));
}

export async function getCandidateResumeSignedUrl(
  resumeUrlOrPath: string | null | undefined,
  candidateId?: string | null
): Promise<string | null> {
  const ref = await resolveCandidateResumeReference(resumeUrlOrPath, candidateId);
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

async function openResumeBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function openCandidateResume(
  resumeUrlOrPath: string | null | undefined,
  candidateId?: string | null
): Promise<void> {
  const id = String(candidateId ?? '').trim();
  if (!isResumeReferenceValid(resumeUrlOrPath, id)) {
    throw new Error('Resume file is missing or was saved in an old format. Attach the file again.');
  }

  const ref = await resolveCandidateResumeReference(resumeUrlOrPath, id);
  if (!ref) {
    throw new Error('Resume file is not available. Try attaching it again.');
  }

  const { data, error } = await supabaseClient.storage.from(ref.bucket).createSignedUrl(ref.path, 3600);
  if (!error && data?.signedUrl) {
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  const download = await supabaseClient.storage.from(ref.bucket).download(ref.path);
  if (download.error || !download.data) {
    throw new Error('Resume file is not available. Try attaching it again.');
  }

  await openResumeBlob(download.data);
}

export function getCandidateResumeAcceptAttribute(): string {
  return RESUME_ACCEPT;
}
