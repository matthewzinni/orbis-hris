const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AttendanceRow = {
  employeeId: string;
  name: string;
  department?: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function parsePath(source: unknown, path: string): unknown {
  const segments = String(path || '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
  let current: unknown = source;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function normalizeRows(input: unknown): AttendanceRow[] {
  const rows = Array.isArray(input) ? input : [];
  return rows
    .map((row) => {
      const rec = (row || {}) as Record<string, unknown>;
      const employeeId = String(
        rec.employeeId || rec.employee_id || rec.id || rec.employeeNumber || ''
      ).trim();
      const name = String(
        rec.name || rec.fullName || rec.employee_name || rec.displayName || ''
      ).trim();
      const department = String(rec.department || rec.dept || '').trim();

      if (!employeeId && !name) return null;

      return {
        employeeId: employeeId || '—',
        name: name || employeeId || 'Unknown',
        department: department || undefined,
      } satisfies AttendanceRow;
    })
    .filter((row): row is AttendanceRow => Boolean(row));
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
    if (!authHeader) return jsonResponse({ error: 'Missing authorization' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }

    const userId = await getUserIdFromJwt(supabaseUrl, supabaseAnonKey, authHeader);
    if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

    const apiUrl = String(Deno.env.get('INTUIT_WORKFORCE_ATTENDANCE_URL') || '').trim();
    const apiToken = String(Deno.env.get('INTUIT_WORKFORCE_API_TOKEN') || '').trim();
    const presentPath = String(Deno.env.get('INTUIT_WORKFORCE_PRESENT_PATH') || 'present').trim();
    const absentPath = String(Deno.env.get('INTUIT_WORKFORCE_ABSENT_PATH') || 'absent').trim();
    const asOfPath = String(Deno.env.get('INTUIT_WORKFORCE_ASOF_PATH') || 'asOf').trim();
    const timezonePath = String(Deno.env.get('INTUIT_WORKFORCE_TIMEZONE_PATH') || 'timezone').trim();

    if (!apiUrl || !apiToken) {
      return jsonResponse(
        {
          error:
            'Attendance API is not configured. Set INTUIT_WORKFORCE_ATTENDANCE_URL and INTUIT_WORKFORCE_API_TOKEN.',
        },
        503
      );
    }

    const upstream = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json',
      },
    });

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 500);
      console.error('[intuit-workforce-attendance] upstream error', upstream.status, detail);
      return jsonResponse({ error: `Attendance upstream HTTP ${upstream.status}` }, 502);
    }

    const payload = (await upstream.json()) as Record<string, unknown>;
    const presentRaw = parsePath(payload, presentPath);
    const absentRaw = parsePath(payload, absentPath);
    const asOfRaw = parsePath(payload, asOfPath);
    const timezoneRaw = parsePath(payload, timezonePath);

    return jsonResponse({
      source: 'Intuit Workforce',
      asOf: String(asOfRaw || new Date().toISOString()),
      timezone: String(timezoneRaw || '').trim() || undefined,
      present: normalizeRows(presentRaw),
      absent: normalizeRows(absentRaw),
    });
  } catch (err) {
    console.error('[intuit-workforce-attendance]', err);
    return jsonResponse({ error: 'Unexpected server error' }, 500);
  }
});
