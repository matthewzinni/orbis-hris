const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are an experienced HR investigations advisor assisting internal investigators at BTW Global (manufacturing / operations, United States — primarily North Carolina operations).

Your job is to suggest practical next steps and highlight common federal and North Carolina employment-law considerations when discipline or termination may follow an investigation.

Rules:
- Use ONLY facts provided in the case packet. Do not assume witnesses, policies, or outcomes not stated.
- This is NOT legal advice. Always recommend consulting qualified employment counsel for final decisions.
- Be specific to the current investigation status and severity when suggesting next steps.
- If discipline or termination is contemplated (category, outcome, findings, or allegation type), include compliance-oriented checkpoints — not definitive legal conclusions.
- Cover relevant federal frameworks at a high level when applicable: Title VII, ADA, ADEA, FMLA, USERRA, NLRA (if union context mentioned), FLSA, retaliation protections, documentation/consistency, and progressive discipline where appropriate.
- Cover North Carolina considerations when relevant: at-will employment (with exceptions), NC Retaliatory Employment Discrimination Act (REDA), NC Equal Employment Practices Act, workers' compensation retaliation, wage/hour (NC Wage and Hour Act), unemployment process, and final pay / owed wages timing themes (describe generally, no specific dollar amounts unless provided).
- If facts are insufficient, say what information is still needed before recommending termination or serious discipline.
- Plain text only. Use these section labels exactly (each on its own line):

NEXT BEST MOVE
WORKFLOW CHECKLIST
DISCIPLINE & TERMINATION — FEDERAL CHECKPOINTS
NORTH CAROLINA CHECKPOINTS
DOCUMENTATION & RISK FLAGS
NOT LEGAL ADVICE

Under each section use short bullet lines starting with "• ".
Keep total response under 550 words unless the case is critical severity, then up to 700 words.`;

type InterviewItem = { type?: string; date?: string; notes?: string };

type RequestBody = {
  caseNumber?: string;
  title?: string;
  category?: string;
  status?: string;
  severity?: string;
  allegationSummary?: string;
  witnesses?: string;
  findingsSummary?: string;
  outcome?: string;
  recommendedAction?: string;
  targetedEmployees?: string[];
  focusEmployees?: string[];
  reportedBy?: string;
  interviews?: InterviewItem[];
  evidenceCount?: number;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function buildUserPrompt(body: RequestBody): string {
  const lines: string[] = [];

  if (body.caseNumber) lines.push(`Case: ${body.caseNumber}`);
  if (body.title) lines.push(`Title: ${body.title}`);
  if (body.category) lines.push(`Category: ${body.category}`);
  if (body.status) lines.push(`Status: ${body.status}`);
  if (body.severity) lines.push(`Severity: ${body.severity}`);
  if (body.reportedBy) lines.push(`Reported by: ${body.reportedBy}`);

  const targeted = Array.isArray(body.targetedEmployees) ? body.targetedEmployees : [];
  if (targeted.length) lines.push(`Targeted employee(s): ${targeted.join('; ')}`);

  const focus = Array.isArray(body.focusEmployees) ? body.focusEmployees : [];
  if (focus.length) lines.push(`Focus employee(s): ${focus.join('; ')}`);

  lines.push('');
  lines.push('Allegation summary:');
  lines.push(String(body.allegationSummary || '').trim() || '(not provided)');

  if (body.witnesses?.trim()) {
    lines.push('');
    lines.push('Witness notes:');
    lines.push(body.witnesses.trim());
  }

  if (body.findingsSummary?.trim()) {
    lines.push('');
    lines.push('Findings summary:');
    lines.push(body.findingsSummary.trim());
  }

  if (body.outcome?.trim()) {
    lines.push('');
    lines.push(`Outcome (if set): ${body.outcome.trim()}`);
  }

  if (body.recommendedAction?.trim()) {
    lines.push('');
    lines.push('Recommended action (draft):');
    lines.push(body.recommendedAction.trim());
  }

  const interviews = Array.isArray(body.interviews) ? body.interviews : [];
  if (interviews.length) {
    lines.push('');
    lines.push('Interviews logged:');
    interviews.forEach((item, index) => {
      const type = String(item?.type || `Interview ${index + 1}`).trim();
      const date = String(item?.date || '').trim();
      const notes = String(item?.notes || '').trim();
      lines.push(`- ${type}${date ? ` (${date})` : ''}: ${notes || '(no notes)'}`);
    });
  }

  if (typeof body.evidenceCount === 'number') {
    lines.push('');
    lines.push(`Evidence items on file: ${body.evidenceCount}`);
  }

  lines.push('');
  lines.push(
    'Draft investigator guidance: next best move, workflow checklist, and federal/NC checkpoints if discipline or termination may apply.'
  );

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

  if (!res.ok) return null;

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
            'AI guidance is not configured. Set OPENAI_API_KEY in Supabase Edge Function secrets.',
        },
        503
      );
    }

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    if (!body || typeof body !== 'object') {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const allegation = String(body.allegationSummary || '').trim();
    const title = String(body.title || '').trim();
    if (!allegation && !title) {
      return jsonResponse({ error: 'Case title or allegation summary is required' }, 400);
    }

    const userPrompt = buildUserPrompt(body);
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
        temperature: 0.3,
        max_tokens: 1100,
      }),
    });

    if (!openaiRes.ok) {
      const detail = await openaiRes.text();
      console.error('[investigation-hr-guidance] OpenAI error:', openaiRes.status, detail);
      return jsonResponse({ error: 'AI provider request failed' }, 502);
    }

    const completion = await openaiRes.json();
    const guidance = String(completion?.choices?.[0]?.message?.content || '').trim();

    if (!guidance) {
      return jsonResponse({ error: 'AI returned empty guidance' }, 502);
    }

    return jsonResponse({ guidance });
  } catch (err) {
    console.error('[investigation-hr-guidance]', err);
    return jsonResponse({ error: 'Unexpected server error' }, 500);
  }
});
