/**
 * Emails payroll/accounting when a payroll handoff is logged (hire, termination, …).
 *
 * Called by the browser right after a row is inserted into public.payroll_handoffs
 * (src/services/payrollChangeEmail.ts). Each handoff emails at most once:
 * payroll_handoffs.payroll_email_sent_at is claimed atomically before sending.
 *
 * Secrets:
 *   PAYROLL_NOTIFY_EMAILS        recipients, comma-separated (required; nothing is sent when unset)
 *   PAYROLL_NOTIFY_CONTACT_NAME  first name the email opens with (default "Cole")
 *   PAYROLL_NOTIFY_EVENTS        event keys that email (default "new_hire,termination"; see compose.ts)
 *   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_FROM  (shared with notify-leave-request)
 *
 * Body: { handoff_id: string, dry_run?: boolean }
 *   dry_run returns the composed email without sending or marking the handoff.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { jsonResponse, requireOrbisAuth } from '../_shared/orbisEdgeAuth.ts';
import { sendSmtpEmail } from '../_shared/smtp.ts';
import {
  composePayrollEmail,
  parsePayrollNotifyEvents,
  parseRecipientEmails,
  type PayrollEmployeeRow,
  type PayrollHandoffRow,
} from './compose.ts';

const LOG = 'notify-payroll-change';
/** Only handoffs logged recently can email, so an old row is never mailed by accident. */
const MAX_HANDOFF_AGE_MS = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  const auth = await requireOrbisAuth(req, 'orbis_is_admin', LOG);
  if (!auth.ok) return auth.response;

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!serviceKey) {
      return jsonResponse({ error: 'Server configuration missing' }, 500);
    }

    const body = (await req.json().catch(() => ({}))) as {
      handoff_id?: string;
      dry_run?: boolean;
    };
    const handoffId = String(body.handoff_id || '').trim();
    const dryRun = body.dry_run === true;
    if (!handoffId) {
      return jsonResponse({ error: 'handoff_id required' }, 400);
    }

    const admin = createClient(auth.supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: handoff, error: handoffErr } = await admin
      .from('payroll_handoffs')
      .select(
        'id, employee_id, change_type, effective_date, summary, payload, created_by, created_at, payroll_email_sent_at'
      )
      .eq('id', handoffId)
      .maybeSingle();

    if (handoffErr || !handoff) {
      return jsonResponse({ error: 'Payroll handoff not found' }, 404);
    }

    const { data: employee } = await admin
      .from('employees')
      .select(
        'id, first_name, last_name, department, position, supervisor, status, hire_date, termination_date, pay_type, standard_hours, benefits_status'
      )
      .eq('id', handoff.employee_id)
      .maybeSingle();

    let changedByName: string | null = null;
    const createdBy = String(handoff.created_by || '').trim().toLowerCase();
    if (createdBy) {
      const { data: actor } = await admin
        .from('employees')
        .select('first_name, last_name')
        .ilike('work_email', createdBy)
        .limit(1)
        .maybeSingle();
      changedByName = actor ? `${actor.first_name || ''} ${actor.last_name || ''}`.trim() : null;
    }

    const email = composePayrollEmail({
      handoff: handoff as PayrollHandoffRow,
      employee: (employee || null) as PayrollEmployeeRow | null,
      contactFirstName: Deno.env.get('PAYROLL_NOTIFY_CONTACT_NAME') || 'Cole',
      changedByName,
      appUrl: Deno.env.get('ORBIS_APP_URL') || 'https://www.orbis-btw.com',
    });

    const enabled = parsePayrollNotifyEvents(Deno.env.get('PAYROLL_NOTIFY_EVENTS'));
    const to = parseRecipientEmails(Deno.env.get('PAYROLL_NOTIFY_EMAILS'));

    if (dryRun) {
      return jsonResponse({
        dry_run: true,
        event: email.event,
        would_send: enabled.has(email.event) && to.length > 0,
        to,
        subject: email.subject,
        text: email.text,
      });
    }

    if (!enabled.has(email.event)) {
      return jsonResponse({ skipped: true, reason: 'Event not enabled', event: email.event });
    }

    if (handoff.payroll_email_sent_at) {
      return jsonResponse({ skipped: true, reason: 'Already emailed', event: email.event });
    }

    const createdAt = Date.parse(String(handoff.created_at || ''));
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > MAX_HANDOFF_AGE_MS) {
      return jsonResponse({ skipped: true, reason: 'Handoff is older than 24 hours' });
    }

    if (!to.length) {
      console.warn(`[${LOG}] PAYROLL_NOTIFY_EMAILS not set; skipped ${email.event} ${handoffId}`);
      return jsonResponse({ skipped: true, reason: 'PAYROLL_NOTIFY_EMAILS not set' });
    }

    const smtpHost = Deno.env.get('SMTP_HOST') || '';
    const smtpUser = Deno.env.get('SMTP_USER') || '';
    const smtpPass = Deno.env.get('SMTP_PASS') || '';
    if (!smtpHost || !smtpUser || !smtpPass) {
      console.warn(`[${LOG}] SMTP not configured; skipped ${email.event} ${handoffId}`);
      return jsonResponse({ skipped: true, reason: 'SMTP not configured' });
    }

    // Claim the handoff so a repeated call can never send twice.
    const { data: claimed, error: claimErr } = await admin
      .from('payroll_handoffs')
      .update({ payroll_email_sent_at: new Date().toISOString(), payroll_email_error: null })
      .eq('id', handoffId)
      .is('payroll_email_sent_at', null)
      .select('id');

    if (claimErr) {
      console.error(`[${LOG}] Claim failed for ${handoffId}:`, claimErr.message);
      return jsonResponse({ error: 'Could not mark handoff' }, 500);
    }
    if (!claimed?.length) {
      return jsonResponse({ skipped: true, reason: 'Already emailed', event: email.event });
    }

    try {
      await sendSmtpEmail({
        host: smtpHost,
        port: Number(Deno.env.get('SMTP_PORT') || '587'),
        user: smtpUser,
        pass: smtpPass,
        from: Deno.env.get('MAIL_FROM') || smtpUser,
        to,
        subject: email.subject,
        text: email.text,
      });
    } catch (sendErr) {
      const message = String(sendErr instanceof Error ? sendErr.message : sendErr).slice(0, 500);
      console.error(`[${LOG}] Send failed for ${email.event} ${handoffId}:`, message);
      await admin
        .from('payroll_handoffs')
        .update({ payroll_email_sent_at: null, payroll_email_error: message })
        .eq('id', handoffId);
      return jsonResponse({ error: 'Email failed', event: email.event }, 502);
    }

    // The email is the handoff to payroll: mark it sent (HR can still mark it confirmed).
    const { error: statusErr } = await admin
      .from('payroll_handoffs')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', handoffId)
      .eq('status', 'pending');
    if (statusErr) {
      console.warn(`[${LOG}] Could not mark ${handoffId} sent:`, statusErr.message);
    }

    console.info(`[${LOG}] Sent ${email.event} for ${handoff.employee_id} to ${to.length} recipient(s)`);
    return jsonResponse({ ok: true, event: email.event, recipients: to.length });
  } catch (err) {
    console.error(`[${LOG}]`, err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
