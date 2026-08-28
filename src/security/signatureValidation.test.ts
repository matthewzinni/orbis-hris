import { describe, expect, it } from 'vitest';
import {
  MAX_SIGNATURE_DATA_URL_LENGTH,
  validateSignatureDataUrl,
} from '../../supabase/functions/form-signature/signatureValidation';

describe('validateSignatureDataUrl', () => {
  it('accepts PNG and JPEG base64 data URLs', () => {
    expect(validateSignatureDataUrl('data:image/png;base64,aGVsbG8=')).toBeNull();
    expect(validateSignatureDataUrl('data:image/jpeg;base64,aGVsbG8=')).toBeNull();
  });

  it('rejects unsupported image types and malformed payloads', () => {
    expect(validateSignatureDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe('invalid');
    expect(validateSignatureDataUrl('data:image/png;base64,<script>')).toBe('invalid');
  });

  it('rejects oversized signatures', () => {
    const oversized = `data:image/png;base64,${'a'.repeat(MAX_SIGNATURE_DATA_URL_LENGTH)}`;
    expect(validateSignatureDataUrl(oversized)).toBe('too_large');
  });
});
