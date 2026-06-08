import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LEADERSHIP_EMAILS = [
  'matthew.zinni@btwglobal.com',
  'trent.wynne@btwglobal.com',
  'brent.wynne@btwglobal.com',
];

type RequestBody = {
  leave_request_id?: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function leaveTypeLabel(value: string): string {
  const map: Record<string, string> = {
    pto: 'PTO',
    sick: 'Sick',
    bereavement: 'Bereavement',
    fmla: 'FMLA',
    unpaid: 'Unpaid',
    other: 'Other',
  };
  return map[String(value || '').toLowerCase()] || 'Time off';
}

function formatDateRange(start: string, end: string | null): string {
  if (!end || end === start) return start;
  return `${start} – ${end}`;
}

async function sendSmtpEmail(options: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
}): Promise<void> {
  const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts');
  const client = new SMTPClient({
    connection: {
      hostname: options.host,
      port: options.port,
      tls: true,
      auth: {
        username: options.user,
        password: options.pass,
      },
    },
  });

  await client.send({
    from: options.from,
    to: options.to,
    subject: options.subject,
    content: options.text,
  });

  await client.close();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const smtpHost = Deno.env.get('SMTP_HOST') || '';
    const smtpUser = Deno.env.get('SMTP_USER') || '';
    const smtpPass = Deno.env.get('SMTP_PASS') || '';

    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: 'Server configuration missing' }, 500);
    }

    if (!smtpHost || !smtpUser || !smtpPass) {
      return jsonResponse({ skipped: true, reason: 'SMTP not configured' });
    }

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const requestId = String(body.leave_request_id || '').trim();
    if (!requestId) {
      return jsonResponse({ error: 'leave_request_id required' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: request, error: reqErr } = await admin
      .from('leave_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (reqErr || !request) {
      return jsonResponse({ error: 'Leave request not found' }, 404);
    }

    const { data: employee } = await admin
      .from('employees')
      .select('id, first_name, last_name, supervisor')
      .eq('id', request.employee_id)
      .maybeSingle();

    const employeeName = employee
      ? `${employee.first_name || ''} ${employee.last_name || ''}`.trim()
      : request.employee_id;

    const recipients = new Set<string>(LEADERSHIP_EMAILS);

    const { data: admins } = await admin
      .from('user_access')
      .select('email')
      .eq('role', 'admin')
      .eq('approval_status', 'approved');

    (admins || []).forEach((row) => {
      const email = String(row.email || '').trim().toLowerCase();
      if (email) recipients.add(email);
    });

    const employeeId = String(request.employee_id || '').trim().toLowerCase();
    const supervisorField = String(employee?.supervisor || '').trim();

    const { data: supervisors } = await admin
      .from('user_access')
      .select('email, supervisor_name, supervised_employee_ids, role, approval_status')
      .eq('role', 'supervisor')
      .eq('approval_status', 'approved');

    (supervisors || []).forEach((row) => {
      const ids = Array.isArray(row.supervised_employee_ids)
        ? row.supervised_employee_ids.map((id: string) => String(id || '').trim().toLowerCase())
        : [];
      const name = String(row.supervisor_name || '').trim().toLowerCase();
      const supCompact = supervisorField.toLowerCase().replace(/[^a-z0-9]/g, '');
      const nameCompact = name.replace(/[^a-z0-9]/g, '');

      const matches =
        ids.includes(employeeId) ||
        (name &&
          supervisorField &&
          (supervisorField.toLowerCase().includes(name) ||
            name.includes(supervisorField.toLowerCase()) ||
            supCompact.includes(nameCompact) ||
            nameCompact.includes(supCompact)));

      if (matches) {
        const email = String(row.email || '').trim().toLowerCase();
        if (email) recipients.add(email);
      }
    });

    const extra = String(Deno.env.get('NOTIFY_LEAVE_EXTRA_EMAILS') || '')
      .split(/[,\s;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    extra.forEach((e) => recipients.add(e));

    const to = Array.from(recipients);
    if (!to.length) {
      return jsonResponse({ skipped: true, reason: 'No recipients' });
    }

    const mailFrom = Deno.env.get('MAIL_FROM') || smtpUser;
    const subject = `Orbis: Time off request — ${employeeName}`;
    const text = [
      `${employeeName} (${request.employee_id}) submitted a time off request in Orbis.`,
      '',
      `Type: ${leaveTypeLabel(request.leave_type)}`,
      `Dates: ${formatDateRange(request.start_date, request.end_date)}`,
      request.hours ? `Hours: ${request.hours}` : '',
      request.notes ? `Notes: ${request.notes}` : '',
      '',
      'Sign in to Orbis → Dashboard → HR Inbox to approve or deny.',
      'https://www.orbis-btw.com',
    ]
      .filter(Boolean)
      .join('\n');

    await sendSmtpEmail({
      host: smtpHost,
      port: Number(Deno.env.get('SMTP_PORT') || '587'),
      user: smtpUser,
      pass: smtpPass,
      from: mailFrom,
      to,
      subject,
      text,
    });

    return jsonResponse({ ok: true, recipients: to.length });
  } catch (err) {
    console.error('[notify-leave-request]', err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
