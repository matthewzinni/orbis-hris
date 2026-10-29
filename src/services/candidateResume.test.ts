import { beforeEach, describe, expect, it, vi } from 'vitest';

const { upload, remove, updateEq, from, storageFrom } = vi.hoisted(() => {
  const upload = vi.fn();
  const remove = vi.fn(() => Promise.resolve({ error: null }));
  const updateEq = vi.fn(() => Promise.resolve({ error: null }));
  const storageFrom = vi.fn(() => ({ upload, remove }));
  const from = vi.fn(() => ({ update: () => ({ eq: updateEq }) }));
  return { upload, remove, updateEq, from, storageFrom };
});

vi.mock('./supabaseClient', () => ({
  supabaseClient: {
    storage: { from: storageFrom },
    from,
  },
}));

import {
  buildResumeReferenceCandidates,
  isResumeReferenceValid,
  parseResumeReference,
  resumeFileLabel,
  uploadCandidateResume,
} from './candidateResume';

describe('candidateResume', () => {
  const candidateId = '11111111-1111-1111-1111-111111111111';

  it('parses bucket references and legacy folder paths', () => {
    expect(parseResumeReference('candidate-resumes:abc/file.pdf')).toEqual({
      bucket: 'candidate-resumes',
      path: 'abc/file.pdf',
    });
    expect(parseResumeReference(`${candidateId}/1700000000000_resume.pdf`)).toEqual({
      bucket: 'candidate-resumes',
      path: `${candidateId}/1700000000000_resume.pdf`,
    });
    expect(parseResumeReference('documents:candidate-resumes/abc/file.pdf')).toEqual({
      bucket: 'documents',
      path: 'candidate-resumes/abc/file.pdf',
    });
  });

  it('builds fallback candidates for bare legacy filenames in candidate folders', () => {
    const refs = buildResumeReferenceCandidates('brianna.pdf', candidateId);
    expect(refs).toEqual(
      expect.arrayContaining([
        { bucket: 'candidate-resumes', path: `${candidateId}/brianna.pdf` },
        {
          bucket: 'documents',
          path: `candidate-resumes/${candidateId}/brianna.pdf`,
        },
      ])
    );
  });

  it('treats legacy filenames as viewable when candidate id is known', () => {
    expect(isResumeReferenceValid('brianna.pdf')).toBe(false);
    expect(isResumeReferenceValid('brianna.pdf', candidateId)).toBe(true);
    expect(isResumeReferenceValid('candidate-resumes:abc/file.pdf', candidateId)).toBe(true);
  });

  it('labels resume files without timestamp prefixes', () => {
    expect(resumeFileLabel('candidate-resumes:abc/1700000000000_brianna.pdf')).toBe('brianna.pdf');
  });
});

describe('uploadCandidateResume', () => {
  const candidateId = '11111111-1111-1111-1111-111111111111';
  const file = new File(['resume content'], 'resume.pdf', { type: 'application/pdf' });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not delete the prior resume when the new upload fails', async () => {
    upload.mockResolvedValue({ error: { message: 'disk full' } });

    await expect(
      uploadCandidateResume(candidateId, file, `candidate-resumes:${candidateId}/old.pdf`)
    ).rejects.toThrow();

    expect(remove).not.toHaveBeenCalled();
  });

  it('deletes the prior resume only after the new upload and DB update both succeed', async () => {
    upload.mockResolvedValue({ error: null });

    await uploadCandidateResume(candidateId, file, `candidate-resumes:${candidateId}/old.pdf`);

    expect(updateEq).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith([`${candidateId}/old.pdf`]);
    const uploadOrder = upload.mock.invocationCallOrder[0];
    const removeOrder = remove.mock.invocationCallOrder[0];
    expect(uploadOrder).toBeLessThan(removeOrder);
  });
});
