import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type FormType = 'discipline' | 'incident' | 'review';
type SignerRole = 'employee' | 'manager' | 'witness';

const TABLE_BY_FORM: Record<FormType, string> = {
  discipline: 'discipline_reports',
  incident: 'incident_reports',
  review: 'employee_reviews',
};

const COLUMN_BY_ROLE: Record<SignerRole, string> = {
  employee: 'employee_signature',
  manager: 'manager_signature',
  witness: 'witness_signature',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!url || !key) {
    throw new Error('Supabase service role is not configured for form-signature.');
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now();
}

function reviewScoreLabel(score: unknown): string {
  const numeric = Number(score);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  if (numeric >= 5) return 'Exceeds Expectations';
  if (numeric >= 3) return 'Meets Expectations';
  if (numeric >= 2) return 'Needs Improvement';
  return 'Below Expectations';
}

function buildReviewAcknowledgmentSummary(row: Record<string, unknown>): string {
  const lines: string[] = [];

  const scoreFields: Array<[string, unknown]> = [
    ['Quality', row.quality_score],
    ['Attendance', row.attendance_score],
    ['Reliability', row.reliability_score],
    ['Communication', row.communication_score],
    ['Judgment', row.judgement_score],
    ['Initiative', row.initiative_score],
    ['Teamwork', row.teamwork_score],
    ['Knowledge', row.knowledge_score],
    ['Training', row.training_score],
  ];

  const ratings = scoreFields
    .map(([label, score]) => {
      const text = reviewScoreLabel(score);
      return text ? `${label}: ${text}` : null;
    })
    .filter(Boolean) as string[];

  if (ratings.length) {
    lines.push('Performance ratings');
    ratings.forEach((rating) => lines.push(`• ${rating}`));
    lines.push('');
  }

  const sections: Array<[string, unknown]> = [
    ['Strengths', row.strengths],
    ['Areas for improvement', row.improvements],
    ['Employee comments / feedback', row.employee_comments],
    ['Manager action plan / next steps', row.manager_comments],
  ];

  sections.forEach(([label, value]) => {
    const text = String(value || '').trim();
    if (!text) return;
    lines.push(String(label));
    lines.push(text);
    lines.push('');
  });

  const snapshot = lines.join('\n').trim();
  if (snapshot) return snapshot.slice(0, 4000);

  const legacy = String(row.summary || row.notes || '').trim();
  return legacy.slice(0, 4000) || 'No review details were recorded for this period.';
}

async function loadEmployeeDisplayName(
  client: ReturnType<typeof createClient>,
  employeeId: string
): Promise<string> {
  const trimmed = String(employeeId || '').trim();
  if (!trimmed) return '';

  const { data, error } = await client
    .from('employees')
    .select('first_name, last_name, id')
    .eq('id', trimmed)
    .maybeSingle();

  if (error || !data) return '';

  return [String(data.first_name || '').trim(), String(data.last_name || '').trim()]
    .filter(Boolean)
    .join(' ');
}

async function loadFormSummary(
  client: ReturnType<typeof createClient>,
  formType: FormType,
  recordId: string,
  employeeId = ''
) {
  const table = TABLE_BY_FORM[formType];
  const { data, error } = await client.from(table).select('*').eq('id', recordId).maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as Record<string, unknown>;

  if (formType === 'discipline') {
    return {
      title: 'Discipline acknowledgment',
      subtitle: String(row.issue_type || 'Discipline report'),
      date: String(row.incident_date || row.created_at || ''),
      summary: String(row.description || '').slice(0, 1200),
    };
  }

  if (formType === 'incident') {
    return {
      title: 'Incident acknowledgment',
      subtitle: String(row.incident_type || row.issue_type || 'Incident report'),
      date: String(row.incident_date || row.created_at || ''),
      summary: String(row.description || '').slice(0, 1200),
    };
  }

  const employeeName = await loadEmployeeDisplayName(
    client,
    String(row.employee_id || employeeId || '')
  );

  return {
    title: 'Performance review acknowledgment',
    subtitle: [employeeName, String(row.review_type || 'Performance review')]
      .filter(Boolean)
      .join(' · '),
    date: String(row.review_date || row.created_at || ''),
    summary: buildReviewAcknowledgmentSummary(row),
    employeeName,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const client = getServiceClient();
    const url = new URL(req.url);
    const token = String(url.searchParams.get('token') || '').trim();

    if (!token) {
      return jsonResponse({ error: 'Missing signing token.' }, 400);
    }

    const { data: requestRow, error: requestError } = await client
      .from('signature_requests')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (requestError || !requestRow) {
      return jsonResponse({ error: 'Signing link is invalid.' }, 404);
    }

    if (requestRow.status === 'signed') {
      return jsonResponse({ error: 'This document has already been signed.', status: 'signed' }, 410);
    }

    if (requestRow.status !== 'pending' || isExpired(requestRow.expires_at)) {
      await client
        .from('signature_requests')
        .update({ status: 'expired' })
        .eq('id', requestRow.id)
        .eq('status', 'pending');

      return jsonResponse({ error: 'This signing link has expired.', status: 'expired' }, 410);
    }

    const formType = requestRow.form_type as FormType;
    const signerRole = requestRow.signer_role as SignerRole;
    const recordId = String(requestRow.record_id || '');

    if (req.method === 'GET') {
      const summary = await loadFormSummary(
        client,
        formType,
        recordId,
        String(requestRow.employee_id || '')
      );

      if (!summary) {
        return jsonResponse({ error: 'The related form could not be found.' }, 404);
      }

      return jsonResponse({
        status: 'pending',
        signerName: requestRow.signer_name || '',
        signerRole,
        formType,
        expiresAt: requestRow.expires_at,
        ...summary,
      });
    }

    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed.' }, 405);
    }

    const body = (await req.json()) as {
      signature?: string;
      signerName?: string;
      agreed?: boolean;
    };

    const signature = String(body.signature || '').trim();
    const signerName = String(body.signerName || requestRow.signer_name || '').trim();
    const agreed = body.agreed === true;

    if (!agreed) {
      return jsonResponse({ error: 'You must agree before signing.' }, 400);
    }

    if (!signerName || signerName.length < 2) {
      return jsonResponse({ error: 'Enter your full name to sign.' }, 400);
    }

    if (!signature.startsWith('data:image/')) {
      return jsonResponse({ error: 'Signature is required.' }, 400);
    }

    const table = TABLE_BY_FORM[formType];
    const column = COLUMN_BY_ROLE[signerRole];

    const formUpdate: Record<string, unknown> = {
      [column]: signature,
    };

    if (signerRole === 'employee') {
      formUpdate.refused_to_sign = false;
    }

    const { error: formUpdateError } = await client
      .from(table)
      .update(formUpdate)
      .eq('id', recordId);

    if (formUpdateError) {
      console.error('[form-signature] form update failed', formUpdateError);
      return jsonResponse({ error: 'Could not save signature on the form.' }, 500);
    }

    const { error: requestUpdateError } = await client
      .from('signature_requests')
      .update({
        status: 'signed',
        signature_data: signature,
        signer_name: signerName,
        signed_at: new Date().toISOString(),
      })
      .eq('id', requestRow.id)
      .eq('status', 'pending');

    if (requestUpdateError) {
      console.error('[form-signature] request update failed', requestUpdateError);
      return jsonResponse({ error: 'Could not finalize signing request.' }, 500);
    }

    return jsonResponse({ ok: true, status: 'signed' });
  } catch (err) {
    console.error('[form-signature] unexpected error', err);
    return jsonResponse({ error: 'Signing service is unavailable.' }, 500);
  }
});
