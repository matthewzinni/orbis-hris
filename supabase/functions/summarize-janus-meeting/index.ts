import { jsonResponse, requireOrbisAuth } from '../_shared/orbisEdgeAuth.ts';

const SYSTEM_PROMPT = `You summarize client and vendor meeting notes for a publishing company's CRM (Janus).

Output format — use these section labels exactly (each on its own line):

SUMMARY
ACTION ITEMS
SUGGESTED FOLLOW-UP

Requirements:
- SUMMARY: 3–5 sentences on what was discussed, decisions, and relationship tone.
- ACTION ITEMS: bullet list (use "- " prefix) of concrete next steps with owners when mentioned.
- SUGGESTED FOLLOW-UP: one line with a recommended follow-up date (YYYY-MM-DD) and reason. If unclear, suggest 7 business days out from the meeting date.
- Keep under 450 words. No markdown beyond section labels.`;

type RequestBody = {
  accountName?: string;
  meetingDate?: string;
  title?: string;
  attendees?: string[];
  transcript?: string;
};

function buildUserPrompt(body: RequestBody): string {
  const lines: string[] = [];
  if (body.accountName) lines.push(`Account: ${body.accountName}`);
  if (body.meetingDate) lines.push(`Meeting date: ${body.meetingDate}`);
  if (body.title) lines.push(`Title: ${body.title}`);
  if (Array.isArray(body.attendees) && body.attendees.length) {
    lines.push(`Attendees: ${body.attendees.join(', ')}`);
  }
  lines.push('');
  lines.push(String(body.transcript || '').trim());
  return lines.join('\n').trim();
}

function parseAiOutput(raw: string): {
  summary: string;
  action_items: string;
  follow_up_date: string | null;
} {
  const text = String(raw || '').trim();
  const summaryMatch = text.match(/SUMMARY\s*([\s\S]*?)(?=ACTION ITEMS|$)/i);
  const actionsMatch = text.match(/ACTION ITEMS\s*([\s\S]*?)(?=SUGGESTED FOLLOW-UP|$)/i);
  const followMatch = text.match(/SUGGESTED FOLLOW-UP\s*([\s\S]*?)$/i);

  const summary = String(summaryMatch?.[1] || text).trim();
  const action_items = String(actionsMatch?.[1] || '').trim();
  const followBlock = String(followMatch?.[1] || '').trim();

  const dateMatch = followBlock.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return {
    summary,
    action_items,
    follow_up_date: dateMatch?.[1] || null,
  };
}

Deno.serve(async (req) => {
  const auth = await requireOrbisAuth(req, 'orbis_can_read_janus', 'summarize-janus-meeting');
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
    if (userPrompt.length < 40) {
      return jsonResponse({ error: 'Transcript or notes are too short to summarize' }, 400);
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
        temperature: 0.35,
        max_tokens: 900,
      }),
    });

    if (!openaiRes.ok) {
      const detail = await openaiRes.text();
      console.error('[summarize-janus-meeting] OpenAI error:', openaiRes.status, detail);
      return jsonResponse({ error: 'AI provider request failed' }, 502);
    }

    const completion = await openaiRes.json();
    const raw = String(completion?.choices?.[0]?.message?.content || '').trim();
    if (!raw) {
      return jsonResponse({ error: 'AI returned an empty summary' }, 502);
    }

    const parsed = parseAiOutput(raw);
    return jsonResponse({
      summary: parsed.summary,
      action_items: parsed.action_items,
      follow_up_date: parsed.follow_up_date,
    });
  } catch (err) {
    console.error('[summarize-janus-meeting]', err);
    return jsonResponse({ error: 'Unexpected server error' }, 500);
  }
});
