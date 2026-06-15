import {
  copySigningLink,
  createSignatureRequest,
  type SignatureFormType,
} from './signatureRequests';

export type RequestEmployeeAcknowledgmentInput = {
  formType: SignatureFormType;
  recordId: string;
  employeeId: string;
  signerName?: string;
  signerEmail?: string;
};

export async function requestEmployeeAcknowledgmentSignature(
  input: RequestEmployeeAcknowledgmentInput
): Promise<{ token: string; signingUrl: string }> {
  const recordId = String(input.recordId || '').trim();
  const employeeId = String(input.employeeId || '').trim();

  if (!recordId) {
    throw new Error('Save the record before requesting a signature.');
  }
  if (!employeeId) {
    throw new Error('Employee is required to request a signature.');
  }

  return createSignatureRequest({
    formType: input.formType,
    recordId,
    employeeId,
    signerRole: 'employee',
    signerName: input.signerName,
    signerEmail: input.signerEmail,
  });
}

/** Create a public signing link and copy it for HR to send to the employee. */
export async function requestAndCopyEmployeeSigningLink(
  input: RequestEmployeeAcknowledgmentInput
): Promise<string> {
  const { signingUrl } = await requestEmployeeAcknowledgmentSignature(input);
  await copySigningLink(signingUrl);
  return signingUrl;
}
