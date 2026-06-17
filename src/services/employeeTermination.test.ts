import { describe, expect, it } from 'vitest';
import {
  applyNewTerminationFieldsToPayload,
  buildTerminationUpdatePayload,
} from './employeeTerminationFields';

describe('employeeTermination', () => {
  it('builds standard termination fields', () => {
    expect(
      buildTerminationUpdatePayload({
        terminationDate: '2026-06-16',
      })
    ).toEqual({
      status: 'TERMINATED',
      termination_date: '2026-06-16',
      termination_reason: 'Not specified',
      notes: 'Terminated employee file retained for turnover history.',
    });
  });

  it('appends retention note to existing notes', () => {
    expect(
      buildTerminationUpdatePayload({
        employee: { notes: 'Prior note' },
        terminationDate: '2026-06-16',
      }).notes
    ).toContain('Prior note');
  });

  it('merges termination fields only for new terminations', () => {
    const payload = { id: 'BTW100', status: 'ACTIVE', department: 'Ops' };

    expect(
      applyNewTerminationFieldsToPayload(payload, {
        isNewTermination: false,
        terminationDate: '2026-06-16',
      })
    ).toEqual(payload);

    expect(
      applyNewTerminationFieldsToPayload(payload, {
        isNewTermination: true,
        terminationDate: '2026-06-16',
      })
    ).toMatchObject({
      id: 'BTW100',
      department: 'Ops',
      status: 'TERMINATED',
      termination_date: '2026-06-16',
      termination_reason: 'Not specified',
    });
  });
});
