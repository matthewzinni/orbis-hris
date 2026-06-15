const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

  if (!res.ok) return null;
  const body = (await res.json()) as { id?: string };
  return typeof body?.id === 'string' && body.id.length > 0 ? body.id : null;
}

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
