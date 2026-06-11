import { createSignatureRequest, type SignatureFormType } from './signatureRequests';

export type RequestEmployeeAcknowledgmentInput = {
  formType: SignatureFormType;
  recordId: string;
  employeeId: string;
  signerName?: string;
  signerEmail?: string;
};

export async function requestEmployeeAcknowledgmentSignature(
  input: RequestEmployeeAcknowledgmentInput
): Promise<{ token: string }> {
  const recordId = String(input.recordId || '').trim();
  const employeeId = String(input.employeeId || '').trim();

  if (!recordId) {
    throw new Error('Save the record before requesting a signature.');
  }
  if (!employeeId) {
    throw new Error('Employee is required to request an in-app signature.');
  }

  const { token } = await createSignatureRequest({
    formType: input.formType,
    recordId,
    employeeId,
    signerRole: 'employee',
    signerName: input.signerName,
    signerEmail: input.signerEmail,
  });

  return { token };
}
