// =========================
// SUPABASE CLIENT
// =========================

const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';

function createOrbisSupabaseClient() {
    if (window.supabaseClient) {
        return window.supabaseClient;
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error('Supabase URL or anon key is missing.');
        return null;
    }

    if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
        console.error('Supabase browser library is not loaded.');
        return null;
    }

    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.supabaseClient;
}

function getOrbisSupabaseClient() {
    return window.supabaseClient || createOrbisSupabaseClient();
}

const supabaseClient = createOrbisSupabaseClient();

// =========================
// GLOBAL EXPORTS
// =========================

window.createOrbisSupabaseClient = createOrbisSupabaseClient;
window.getOrbisSupabaseClient = getOrbisSupabaseClient;
window.supabaseClient = supabaseClient;