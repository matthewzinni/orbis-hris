import { HR_ADVISORY_CORE } from '../_shared/hrAdvisoryPrompt.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `${HR_ADVISORY_CORE}

Task: Synthesize org-wide stay interview themes for leadership readout.

Do NOT open with interview counts or restate how many people were interviewed — leadership sees that in Orbis.
Lead with what pattern matters most and where attention should go.

Plain text only. Use these section labels exactly (each on its own line):

LEADERSHIP PRIORITIES
EMERGING RISKS & PATTERNS
OPPORTUNITIES TO REINFORCE
DEPARTMENT & TEAM DYNAMICS
VOICES BY THEME
RECOMMENDED FOCUS AREAS
DATA NOTE

Section requirements:
- LEADERSHIP PRIORITIES: 2–4 sentences — the strategic takeaway; connect stay interview themes to engagement and retention (Care & Engagement → Retention).
- EMERGING RISKS & PATTERNS: 3–6 bullets interpreting themes that could escalate; note cross-employee or cross-department patterns; end each bullet with names who raised it (e.g. "— Emily Mayo, James Smith (Fulfillment)").
- OPPORTUNITIES TO REINFORCE: 2–5 bullets on strengths, motivation, and cultural positives to amplify — not just "things are fine."
- DEPARTMENT & TEAM DYNAMICS: call out departments where patterns suggest supervisory consistency, workload, communication, or alignment issues vs isolated individual concerns; if insufficient data, say so briefly.
- VOICES BY THEME: one bullet per employee with substantive responses — "• [Name] ([Department]): [brief interpretive theme, not a Q&A recap]".
- RECOMMENDED FOCUS AREAS: prioritized actions (quick wins vs structural); name who to follow up with when relevant.
- DATA NOTE: one line — qualitative synthesis for internal leadership follow-up, not a statistical survey.
- Use ONLY themes supported by the interview responses. Attribute names from the packets.
- Keep total response under 1100 words. This is not legal advice.`;

type ResponseItem = { question: string; answer: string };

type InterviewPacket = {
  label?: string;
  employeeName?: string;
  employeeId?: string;
  department?: string;
  interviewDate?: string;
  interviewType?: string;
  responses?: ResponseItem[];
};

type RequestBody = {
  dateFrom?: string;
  dateTo?: string;
  interviewCount?: number;
  departmentsRepresented?: string[];
  interviews?: InterviewPacket[];
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function buildUserPrompt(body: RequestBody): string {
  const lines: string[] = [];

  if (body.dateFrom || body.dateTo) {
    lines.push(`Date range: ${body.dateFrom || '?'} to ${body.dateTo || '?'}`);
  }
  if (typeof body.interviewCount === 'number') {
    lines.push(`Interviews in analysis: ${body.interviewCount}`);
  }

  const depts = Array.isArray(body.departmentsRepresented) ? body.departmentsRepresented : [];
  if (depts.length) {
    lines.push(`Departments represented: ${depts.join(', ')}`);
  }

  lines.push('');
  lines.push(
    'Below are stay interview packets (employee name, department, date + Q&A). Synthesize strategic themes for leadership — what matters, why, and where to focus. Do not recap interview counts.'
  );
  lines.push('');

  const interviews = Array.isArray(body.interviews) ? body.interviews : [];
  interviews.forEach((packet, index) => {
    const employeeName = String(packet?.employeeName || '').trim();
    const label = String(packet?.label || employeeName || `Interview ${index + 1}`).trim();
    const dept = String(packet?.department || 'Unknown').trim();
    const date = String(packet?.interviewDate || '').trim();
    const type = String(packet?.interviewType || 'Stay Interview').trim();

    lines.push(`--- ${label} ---`);
    if (employeeName) lines.push(`Employee: ${employeeName}`);
    lines.push(`Department: ${dept}`);
    if (date) lines.push(`Date: ${date}`);
    lines.push(`Type: ${type}`);

    const responses = Array.isArray(packet?.responses) ? packet.responses : [];
    let hasAnswer = false;
    responses.forEach((item) => {
      const q = String(item?.question || '').trim();
      const a = String(item?.answer || '').trim();
      if (!a) return;
      hasAnswer = true;
      lines.push(`Q: ${q || 'Question'}`);
      lines.push(`A: ${a}`);
    });

    if (!hasAnswer) {
      lines.push('(No substantive responses recorded)');
    }
    lines.push('');
  });

  if (interviews.length < 1) {
    return '';
  }

  return lines.join('\n');
}

async function getUserIdFromJwt(
  supabaseUrl: string,
  supabaseAnonKey: string,
  authHeader: string
): Promise<string | null> {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: supabaseAnonKey,
    },
  });

  if (!res.ok) {
    return null;
  }

  const body = (await res.json()) as { id?: string };
  return typeof body?.id === 'string' && body.id.length > 0 ? body.id : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }

    const userId = await getUserIdFromJwt(supabaseUrl, supabaseAnonKey, authHeader);
    if (!userId) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      return jsonResponse(
        {
          error:
            'AI themes are not configured. Set OPENAI_API_KEY in Supabase Edge Function secrets.',
        },
        503
      );
    }

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    if (!body || typeof body !== 'object') {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const userPrompt = buildUserPrompt(body);
    if (!userPrompt) {
      return jsonResponse({ error: 'No interview data provided' }, 400);
    }

    const model = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini';

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 1800,
      }),
    });

    if (!openaiRes.ok) {
      const detail = await openaiRes.text();
      console.error('[analyze-stay-themes] OpenAI error:', openaiRes.status, detail);
      return jsonResponse({ error: 'AI provider request failed' }, 502);
    }

    const completion = await openaiRes.json();
    const report = String(completion?.choices?.[0]?.message?.content || '').trim();

    if (!report) {
      return jsonResponse({ error: 'AI returned an empty report' }, 502);
    }

    return jsonResponse({ report });
  } catch (err) {
    console.error('[analyze-stay-themes]', err);
    return jsonResponse({ error: 'Unexpected server error' }, 500);
  }
});
