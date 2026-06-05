import { HR_ADVISORY_CORE } from '../_shared/hrAdvisoryPrompt.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `${HR_ADVISORY_CORE}

Task: Draft an internal HR / Manager Summary after a single stay interview.

Output format — use these section labels exactly (each on its own line):

WHAT MATTERS
ENGAGEMENT SIGNALS
RISKS & EARLY WARNINGS
OPPORTUNITIES
RECOMMENDED FOCUS

Section requirements:
- WHAT MATTERS: 2–3 sentences — the single most important takeaway for leadership; why this conversation matters now.
- ENGAGEMENT SIGNALS: 2–3 bullets on motivation, fit, and support themes (interpret, do not quote Q&A verbatim).
- RISKS & EARLY WARNINGS: 1–3 bullets only if supported; connect to retention, burnout, or team dynamics when employee raised concerns. If low risk, one bullet stating stability and what to monitor.
- OPPORTUNITIES: 1–2 bullets on strengths to reinforce or quick wins for the manager.
- RECOMMENDED FOCUS: 2–4 specific, actionable bullets (who should act, what to discuss, suggested timeframe).
- Keep under 400 words. No markdown beyond section labels.`;

type ResponseItem = { question: string; answer: string };

type RequestBody = {
  employeeName?: string;
  interviewType?: string;
  interviewDate?: string;
  responses?: ResponseItem[];
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function buildUserPrompt(body: RequestBody): string {
  const lines: string[] = [];

  if (body.employeeName) lines.push(`Employee: ${body.employeeName}`);
  if (body.interviewType) lines.push(`Interview type: ${body.interviewType}`);
  if (body.interviewDate) lines.push(`Interview date: ${body.interviewDate}`);
  lines.push('');

  const responses = Array.isArray(body.responses) ? body.responses : [];
  responses.forEach((item, index) => {
    const q = String(item?.question || `Question ${index + 1}`).trim();
    const a = String(item?.answer || '').trim();
    if (!a) return;
    lines.push(`Q: ${q}`);
    lines.push(`A: ${a}`);
    lines.push('');
  });

  if (lines.length < 3) {
    return '';
  }

  lines.push(
    'Synthesize the stay interview for leadership. Lead with what matters and why — not a recap of each answer.'
  );
  return lines.join('\n');
}

/** Validate JWT without bundling @supabase/supabase-js (smaller cold start, fewer boot failures). */
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
            'AI summary is not configured. Set OPENAI_API_KEY in Supabase Edge Function secrets.',
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
      return jsonResponse({ error: 'No employee responses provided' }, 400);
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
        max_tokens: 850,
      }),
    });

    if (!openaiRes.ok) {
      const detail = await openaiRes.text();
      console.error('[summarize-stay-interview] OpenAI error:', openaiRes.status, detail);
      return jsonResponse({ error: 'AI provider request failed' }, 502);
    }

    const completion = await openaiRes.json();
    const summary = String(
      completion?.choices?.[0]?.message?.content || ''
    ).trim();

    if (!summary) {
      return jsonResponse({ error: 'AI returned an empty summary' }, 502);
    }

    return jsonResponse({ summary });
  } catch (err) {
    console.error('[summarize-stay-interview]', err);
    return jsonResponse({ error: 'Unexpected server error' }, 500);
  }
});
