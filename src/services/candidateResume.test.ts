import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabaseClient: {
    storage: { from: vi.fn() },
    from: vi.fn(),
  },
}));

import {
  buildResumeReferenceCandidates,
  isResumeReferenceValid,
  parseResumeReference,
  resumeFileLabel,
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
