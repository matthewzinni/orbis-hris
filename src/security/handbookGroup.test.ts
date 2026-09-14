import { describe, expect, it, vi } from 'vitest';
import { handleHandbookGroup } from '../../supabase/functions/form-signature/handbookGroup';

const respond = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status });
function client(status = 'signed') {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { document_title: 'Employee Handbook Acknowledgement',
      acknowledgment_text: 'Issued wording', expires_at: '2099-01-01' }, error: null }) };
  return { from: vi.fn(() => query), rpc: vi.fn().mockResolvedValue({ data: { status }, error: null }) };
}
const body = { firstName: 'Test', lastName: 'Employee', agreed: true, signature: 'data:image/png;base64,aGVsbG8=' };
const post = (value: unknown) => new Request('https://example.test?group=test', { method: 'POST', body: JSON.stringify(value) });
describe('shared handbook signing endpoint', () => {
  it('shows only the document and no employee records on GET', async () => {
    const db = client();
    const response = await handleHandbookGroup(db as never, new Request('https://example.test'), 'token', respond);
    expect(await response.json()).toEqual({ title: 'Employee Handbook Acknowledgement', subtitle: 'BTW Global LLC',
      summary: 'Issued wording', formType: 'handbook', groupSigning: true, expiresAt: '2099-01-01' });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it.each([{ ...body, firstName: '' }, { ...body, lastName: '' }, { ...body, agreed: false },
    { ...body, signature: 'data:image/svg+xml;base64,PHN2Zz4=' }, null])('rejects invalid input without matching employees', async value => {
    const db = client();
    const response = await handleHandbookGroup(db as never, post(value), 'token', respond);
    expect(response.status).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('passes both names to the atomic matcher, ignoring a supplied employee ID', async () => {
    const db = client();
    const response = await handleHandbookGroup(db as never, post({ ...body, employeeId: 'other-person' }), 'token', respond);
    expect(response.status).toBe(200);
    expect(db.rpc).toHaveBeenCalledWith('orbis_complete_handbook_group_signature', {
      p_token: 'token', p_first_name: 'Test', p_last_name: 'Employee', p_signature: body.signature,
    });
  });
  it('returns an actionable error without revealing matches or signing anyone', async () => {
    const db = client('unmatched');
    const response = await handleHandbookGroup(db as never, post(body), 'token', respond);
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('contact HR');
  });
});
