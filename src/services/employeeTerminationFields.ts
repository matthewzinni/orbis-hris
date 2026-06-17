const RETENTION_NOTE = 'Terminated employee file retained for turnover history.';

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

export type TerminationFieldsInput = {
  employee?: Record<string, unknown> | null;
  terminationDate: string;
  terminationReason?: string;
  appendRetentionNote?: boolean;
};

/** DB patch applied when an employee is newly marked terminated. */
export function buildTerminationUpdatePayload(
  input: TerminationFieldsInput
): Record<string, unknown> {
  const employee = input.employee || {};
  const notes = normalize(employee.notes);
  const shouldAppendNote = input.appendRetentionNote !== false;

  return {
    status: 'TERMINATED',
    termination_date: input.terminationDate,
    termination_reason: normalize(input.terminationReason) || 'Not specified',
    notes: shouldAppendNote
      ? notes
        ? `${notes}\n\n${RETENTION_NOTE}`
        : RETENTION_NOTE
      : notes || null,
  };
}

export function applyNewTerminationFieldsToPayload(
  payload: Record<string, unknown>,
  input: TerminationFieldsInput & { isNewTermination: boolean }
): Record<string, unknown> {
  if (!input.isNewTermination) return payload;
  return {
    ...payload,
    ...buildTerminationUpdatePayload(input),
  };
}
