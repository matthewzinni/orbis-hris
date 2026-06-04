const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are an HR business partner synthesizing stay interview themes across BTW Global (manufacturing / operations, United States) for leadership and HR.

Your goal: help management see what is going well, where friction and retention risk cluster, and what to act on early — without naming individuals.

Rules:
- Use ONLY themes supported by the interview responses provided. Do not invent concerns, praise, or policies.
- Do NOT name individual employees. Refer to departments or roles only when the data supports it.
- Group recurring themes; note prevalence qualitatively (e.g. "several interviews", "a few departments") when patterns are clear.
- Separate strengths (motivation, what is going well), obstacles (frustrations, support gaps), retention signals (what might cause leaving), and support asks (what would help them stay).
- Plain text only. Use these section labels exactly (each on its own line):

EXECUTIVE SUMMARY
WHAT'S GOING WELL
CONCERNS & OBSTACLES
RETENTION RISK SIGNALS
DEPARTMENT SPOTLIGHTS
RECOMMENDED LEADERSHIP ACTIONS
DATA NOTE

Section requirements:
- EXECUTIVE SUMMARY: 2–4 sentences for an executive audience.
- Other sections: bullet lines starting with "• " (3–6 bullets each when data supports it).
- DEPARTMENT SPOTLIGHTS: only call out departments where interviews show a distinct pattern; if insufficient data, say "Not enough department-level variation to highlight."
- RECOMMENDED LEADERSHIP ACTIONS: specific, actionable, prioritized (quick wins vs structural).
- DATA NOTE: one line stating this is qualitative theme synthesis from stay interviews, not a statistical survey; HR should validate before broad communication.
- Keep total response under 950 words.
- This is not legal advice.`;

type ResponseItem = { question: string; answer: string };

type InterviewPacket = {
  label?: string;
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
    'Below are anonymized stay interview packets (department + date + Q&A). Synthesize org-wide themes for leadership.'
  );
  lines.push('');

  const interviews = Array.isArray(body.interviews) ? body.interviews : [];
  interviews.forEach((packet, index) => {
    const label = String(packet?.label || `Interview ${index + 1}`).trim();
    const dept = String(packet?.department || 'Unknown').trim();
    const date = String(packet?.interviewDate || '').trim();
    const type = String(packet?.interviewType || 'Stay Interview').trim();

    lines.push(`--- ${label} ---`);
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
        max_tokens: 1400,
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
