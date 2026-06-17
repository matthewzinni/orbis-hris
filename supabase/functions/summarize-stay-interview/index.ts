import { HR_ADVISORY_CORE } from '../_shared/hrAdvisoryPrompt.ts';
import { jsonResponse, requireOrbisAuth } from '../_shared/orbisEdgeAuth.ts';

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

Deno.serve(async (req) => {
  const auth = await requireOrbisAuth(
    req,
    'orbis_can_access_stay_interview_ai',
    'summarize-stay-interview'
  );
  if (!auth.ok) return auth.response;

  try {
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
