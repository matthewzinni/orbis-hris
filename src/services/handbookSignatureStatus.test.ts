import { describe, expect, it, vi } from 'vitest';
vi.mock('./supabaseClient', () => ({ supabaseClient: {} }));
import { buildHandbookStatus, type HandbookEmployee, type HandbookSignature } from './handbookSignatureStatus';
import { HANDBOOK_DOCUMENT_TITLE } from './handbookAcknowledgments';

const employee = (id: string, status = 'ACTIVE'): HandbookEmployee => ({ id, first_name: id, last_name: 'Employee', department: 'Operations', status });
const signature = (employee_id: string, changes: Partial<HandbookSignature> = {}): HandbookSignature => ({
  id: 'signed-record', employee_id, document_title: HANDBOOK_DOCUMENT_TITLE,
  signed_at: '2026-09-15T10:00:00Z', signer_name: 'Signed Name', ...changes,
});
describe('handbook signature status', () => {
  it('includes people who have never opened the shared link as pending', () => {
    const rows = buildHandbookStatus([employee('A'), employee('B')], [signature('A')]);
    expect(rows.map(row => [row.employeeId, !!row.signedAt])).toEqual([['A', true], ['B', false]]);
  });
  it('does not count an older handbook or an unsigned request as signed', () => {
    const rows = buildHandbookStatus([employee('A'), employee('B')], [
      signature('A', { document_title: 'Employee Handbook 3.0' }), signature('B', { signed_at: null }),
    ]);
    expect(rows.every(row => row.signedAt === null && row.recordId === null)).toBe(true);
  });
  it('keeps the latest signed form even if another request is unsigned', () => {
    const rows = buildHandbookStatus([employee('A')], [signature('A'),
      signature('A', { id: 'pending', signed_at: null }), signature('A', { id: 'older', signed_at: '2026-09-14T10:00:00Z' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].recordId).toBe('signed-record');
  });
  it('includes staff on leave but excludes former and inactive staff', () => {
    const rows = buildHandbookStatus([employee('A', 'Leave'), employee('B', ' terminated '), employee('C', 'INACTIVE'), employee('D', 'ARCHIVED')], []);
    expect(rows.map(row => row.employeeId)).toEqual(['A']);
  });
});
