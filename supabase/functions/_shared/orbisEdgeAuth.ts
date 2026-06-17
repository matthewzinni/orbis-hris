import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function getUserIdFromJwt(
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

export async function orbisRpcAllowed(
  supabaseUrl: string,
  supabaseAnonKey: string,
  authHeader: string,
  rpcName: string,
  logPrefix: string
): Promise<boolean> {
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await client.rpc(rpcName);
  if (error) {
    console.error(`[${logPrefix}] ${rpcName} failed:`, error.message);
    return false;
  }

  return data === true;
}

export async function requireOrbisAuth(
  req: Request,
  rpcName: string,
  logPrefix: string
): Promise<
  | { ok: true; supabaseUrl: string; supabaseAnonKey: string; authHeader: string }
  | { ok: false; response: Response }
> {
  if (req.method === 'OPTIONS') {
    return { ok: false, response: new Response('ok', { headers: corsHeaders }) };
  }

  if (req.method !== 'POST') {
    return { ok: false, response: jsonResponse({ error: 'Method not allowed' }, 405) };
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { ok: false, response: jsonResponse({ error: 'Missing authorization' }, 401) };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, response: jsonResponse({ error: 'Server configuration error' }, 500) };
  }

  const userId = await getUserIdFromJwt(supabaseUrl, supabaseAnonKey, authHeader);
  if (!userId) {
    return { ok: false, response: jsonResponse({ error: 'Unauthorized' }, 401) };
  }

  const allowed = await orbisRpcAllowed(supabaseUrl, supabaseAnonKey, authHeader, rpcName, logPrefix);
  if (!allowed) {
    return { ok: false, response: jsonResponse({ error: 'Forbidden' }, 403) };
  }

  return { ok: true, supabaseUrl, supabaseAnonKey, authHeader };
}
