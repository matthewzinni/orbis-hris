import type { SignatureFormType, SignatureSignerRole } from '../services/signatureRequests';

/** GET response from the `form-signature` edge function. */
export type SignPayload = {
  status?: string;
  title?: string;
  subtitle?: string;
  date?: string;
  summary?: string;
  employeeName?: string;
  signerName?: string;
  signerRole?: SignatureSignerRole;
  formType?: SignatureFormType;
  expiresAt?: string;
  error?: string;
};
