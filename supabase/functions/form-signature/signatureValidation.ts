export const MAX_SIGNATURE_DATA_URL_LENGTH = 2_000_000;

const SIGNATURE_DATA_URL_PATTERN = /^data:image\/(?:png|jpeg);base64,[a-z0-9+/]+={0,2}$/i;

export function validateSignatureDataUrl(value: string): 'invalid' | 'too_large' | null {
  if (!SIGNATURE_DATA_URL_PATTERN.test(value)) return 'invalid';
  if (value.length > MAX_SIGNATURE_DATA_URL_LENGTH) return 'too_large';
  return null;
}
