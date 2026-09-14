import { validateSignatureDataUrl } from './signatureValidation.ts';

type GroupSignatureClient = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: { document_title: string; acknowledgment_text: string; expires_at: string } | null; error: unknown }>;
      };
    };
  };
  rpc(name: string, args: Record<string, string>): PromiseLike<{ data: { status?: string } | null; error: unknown }>;
};

export async function handleHandbookGroup(
  client: GroupSignatureClient, req: Request, token: string,
  respond: (body: Record<string, unknown>, status?: number) => Response
): Promise<Response> {
  const { data: link, error } = await client.from('handbook_group_links')
    .select('document_title, acknowledgment_text, expires_at').eq('token', token).maybeSingle();
  if (error || !link || new Date(link.expires_at).getTime() <= Date.now()) {
    return respond({ error: 'This group signing link is unavailable or has expired. Contact HR for a new link.' }, 410);
  }
  if (req.method === 'GET') {
    return respond({ title: link.document_title, subtitle: 'BTW Global LLC', summary: link.acknowledgment_text,
      formType: 'handbook', groupSigning: true, expiresAt: link.expires_at });
  }
  if (req.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return respond({ error: 'Invalid signing submission.' }, 400); }
  if (!body || typeof body !== 'object') return respond({ error: 'Invalid signing submission.' }, 400);
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  const signature = typeof body.signature === 'string' ? body.signature.trim() : '';
  if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100) {
    return respond({ error: 'Enter your first and last name as recorded with HR.' }, 400);
  }
  if (body.agreed !== true) return respond({ error: 'You must agree before signing.' }, 400);
  const invalid = validateSignatureDataUrl(signature);
  if (invalid) return respond({ error: 'A valid signature is required.' }, invalid === 'too_large' ? 413 : 400);
  const { data, error: signingError } = await client.rpc('orbis_complete_handbook_group_signature', {
    p_token: token, p_first_name: firstName, p_last_name: lastName, p_signature: signature,
  });
  if (signingError) return respond({ error: 'Could not save your acknowledgement. Please try again.' }, 500);
  if (data?.status === 'signed') return respond({ ok: true, status: 'signed' });
  if (data?.status === 'invalid') return respond({ error: 'This group signing link has expired. Contact HR for a new link.' }, 410);
  return respond({ error: 'We could not match your name to one employee record. Check your first and last name or contact HR. Your signature has not been saved.' }, 422);
}
