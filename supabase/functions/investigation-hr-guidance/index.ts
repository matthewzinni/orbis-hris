const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are a senior HR investigations advisor at BTW Global (manufacturing / operations, United States — primarily North Carolina).

Your PRIMARY job is to read the case packet — especially interview notes — and deliver a clear investigative judgment with a recommended outcome. Workflow steps and compliance checkpoints are secondary.

Rules:
- Use ONLY facts in the case packet. Do not invent witnesses, admissions, or policies not stated.
- When interview notes are provided, you MUST analyze them in detail. Do NOT respond with only generic procedures or legal checklists.
- Compare interview accounts: note corroboration, contradictions, and credibility themes (specificity, consistency, motive).
- This is NOT legal advice. Recommend employment counsel review before termination or serious discipline.
- Plain text only. Use these section labels exactly (each on its own line):

FINDINGS & RECOMMENDATION
INTERVIEW ANALYSIS
NEXT BEST MOVE
COMPLIANCE CHECKPOINTS — FEDERAL
COMPLIANCE CHECKPOINTS — NORTH CAROLINA
DOCUMENTATION & RISK FLAGS
NOT LEGAL ADVICE

Section requirements:

FINDINGS & RECOMMENDATION (always first — this is the judgment call):
• State a preliminary finding: Substantiated | Partially substantiated | Unsubstantiated | Inconclusive
• State confidence: High | Medium | Low — and why in one line
• Name who (by interview role/type) supports or undermines the allegation
• Recommended outcome (pick the best fit): unsubstantiated, policy_reminder, coaching, corrective_action, termination_recommended, process_improvement, referred_to_leadership, or inconclusive pending more evidence
• Recommended action: 2–4 specific next steps for HR (e.g., who to coach, what policy to cite, whether more interviews are needed)
• If interviews are missing or insufficient, say exactly what is still needed BEFORE recommending termination or serious discipline

INTERVIEW ANALYSIS:
• One bullet block per logged interview (type, date): key facts stated, alignment with allegation, conflicts with other interviews
• If no interviews logged, say "No interviews provided — finding must remain inconclusive until interviews are complete."

Under other sections use short bullet lines starting with "• ".
Keep total response under 750 words when interviews are present (up to 950 for critical severity).`;

type InterviewItem = { type?: string; date?: string; notes?: string; interviewer?: string };

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
    lines.push(`Interview notes (${interviews.length} logged — analyze all before recommending):`);
    interviews.forEach((item, index) => {
      const type = String(item?.type || `Interview ${index + 1}`).trim();
      const date = String(item?.date || '').trim();
      const interviewer = String(item?.interviewer || '').trim();
      const notes = String(item?.notes || '').trim();
      const header = `- ${type}${date ? ` (${date})` : ''}${interviewer ? ` — ${interviewer}` : ''}`;
      lines.push(header);
      lines.push(notes ? notes : '(no notes recorded)');
      lines.push('');
    });
  } else {
    lines.push('');
    lines.push('Interview notes: (none logged yet)');
  }

  if (typeof body.evidenceCount === 'number') {
    lines.push('');
    lines.push(`Evidence items on file: ${body.evidenceCount}`);
  }

  lines.push('');
  if (interviews.length) {
    lines.push(
      'Analyze every interview note above. Lead with FINDINGS & RECOMMENDATION (preliminary finding, confidence, recommended outcome, and specific action). Then INTERVIEW ANALYSIS comparing accounts. Include compliance checkpoints only where discipline or termination may follow.'
    );
  } else {
    lines.push(
      'No interviews logged yet. State that findings are inconclusive, list required interviews, and give next steps. Do not recommend termination or serious discipline without interview evidence.'
    );
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
        temperature: 0.35,
        max_tokens: 1600,
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
