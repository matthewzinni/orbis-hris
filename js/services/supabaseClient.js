// Supabase client setup for Orbis
// This file must stay JavaScript only. Do not put HTML in this file.

const SUPABASE_URL = 'https://fxljbnyarfwnqgheywgw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4bGpibnlhcmZ3bnFnaGV5d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MzczMTQsImV4cCI6MjA5MTMxMzMxNH0.FREA-R6UGJoy1K_6Y8QejSZ7-gwo3vOsl3MBJCElDIE';

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// Fallback OrbisServices layer so older modules do not crash

window.OrbisServices = window.OrbisServices || {};

window.OrbisServices.employees = window.OrbisServices.employees || {

    getAll: async () => window.supabaseClient.from('employees').select('*'),

    create: async (payload) => window.supabaseClient.from('employees').insert([payload]).select(),

    update: async (id, payload) => window.supabaseClient.from('employees').update(payload).eq('id', id).select(),

    remove: async (id) => window.supabaseClient.from('employees').delete().eq('id', id)

};

window.OrbisServices.employeeHistory = window.OrbisServices.employeeHistory || {

    getAll: async (employeeId) => window.supabaseClient

        .from('employee_audit_log')

        .select('*')

        .eq('employee_id', employeeId)

        .order('created_at', { ascending: false }),

    getByEmployee: async (employeeId) => window.supabaseClient

        .from('employee_audit_log')

        .select('*')

        .eq('employee_id', employeeId)

        .order('created_at', { ascending: false })

};