import { describe, expect, it, vi } from 'vitest';
vi.mock('../services/supabaseClient', () => ({ supabaseClient: {} }));
import { renderSignedHandbook } from './handbookAcknowledgments';
import { HANDBOOK_ACKNOWLEDGMENT_TEXT } from '../services/handbookAcknowledgments';

const record = {
  id: 'record-1', employee_id: 'E1', employee_name: 'Test Employee',
  document_title: 'Employee Handbook Acknowledgement', acknowledgment_text: HANDBOOK_ACKNOWLEDGMENT_TEXT,
  created_at: '2026-09-14T15:00:00Z', signed_at: '2026-09-14T16:00:00Z',
  signer_name: 'Test Employee', employee_signature: 'data:image/png;base64,aGVsbG8=',
};
describe('signed handbook record', () => {
  it('preserves the issued wording, employee, signature and recorded timestamp', () => {
    const html = renderSignedHandbook(record);
    expect(html).toContain(HANDBOOK_ACKNOWLEDGMENT_TEXT);
    expect(html).toContain('Employee Name: Test Employee');
    expect(html).toContain('data:image/png;base64,aGVsbG8=');
    expect(html).toContain('2026-09-14T16:00:00Z');
    expect(html).toContain('Record: record-1');
  });
  it('escapes employee-entered text and rejects executable signature sources', () => {
    const html = renderSignedHandbook({ ...record, signer_name: '<script>alert(1)</script>',
      employee_signature: 'data:image/svg+xml;base64,PHN2Zz4=' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<img');
  });
});
