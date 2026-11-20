import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  composePayrollEmail,
  parsePayrollNotifyEvents,
  parseRecipientEmails,
  payrollEventKey,
  type PayrollEmployeeRow,
  type PayrollHandoffRow,
} from '../../supabase/functions/notify-payroll-change/compose';

function handoff(overrides: Partial<PayrollHandoffRow> = {}): PayrollHandoffRow {
  return {
    id: 'h-1',
    employee_id: 'BTW2150',
    change_type: 'new_hire',
    effective_date: '2026-11-24',
    summary: 'New hire — Jordan Rivera',
    payload: { hire_date: '2026-11-24' },
    created_by: 'matthew.zinni@btwglobal.com',
    created_at: '2026-11-20T15:00:00Z',
    ...overrides,
  };
}

const employee: PayrollEmployeeRow = {
  id: 'BTW2150',
  first_name: 'Jordan',
  last_name: 'Rivera',
  department: 'Warehouse',
  position: 'Forklift Operator',
  supervisor: 'Pat Lee',
  hire_date: '2026-11-24',
  pay_type: 'Hourly',
  standard_hours: 40,
};

describe('payroll change email', () => {
  it('opens a hire email with the exact required line', () => {
    const email = composePayrollEmail({
      handoff: handoff(),
      employee,
      contactFirstName: 'Cole',
      changedByName: 'Matthew Zinni',
    });

    expect(email.event).toBe('new_hire');
    expect(email.text.split('\n')[0]).toBe(
      'Cole, Jordan Rivera was hired. Please add them to payroll.'
    );
    expect(email.subject).toBe('Payroll: New hire — Jordan Rivera (starts 2026-11-24)');
    expect(email.text).toContain('Start date:');
    expect(email.text).toContain('Tue, Nov 24, 2026');
    expect(email.text).toContain('Forklift Operator');
    expect(email.text).toContain('Warehouse');
    expect(email.text).toContain('40 per week');
    expect(email.text).toContain('Matthew Zinni (matthew.zinni@btwglobal.com)');
  });

  it('opens a termination email with the exact required line', () => {
    const email = composePayrollEmail({
      handoff: handoff({
        change_type: 'termination',
        effective_date: '2026-11-20',
        summary: 'Termination — Jordan Rivera',
        payload: { from_status: 'ACTIVE', to_status: 'TERMINATED' },
      }),
      employee: { ...employee, status: 'TERMINATED', termination_date: '2026-11-20' },
      contactFirstName: 'Cole',
    });

    expect(email.event).toBe('termination');
    expect(email.text.split('\n')[0]).toBe(
      'Cole, Jordan Rivera has been terminated. Please process their final paycheck.'
    );
    expect(email.subject).toBe('Payroll: Termination — Jordan Rivera (effective 2026-11-20)');
    expect(email.text).toContain('Termination date:');
    expect(email.text).toContain('Fri, Nov 20, 2026');
  });

  it('falls back to the handoff summary name when the employee row is missing', () => {
    const email = composePayrollEmail({
      handoff: handoff(),
      employee: null,
      contactFirstName: 'Cole',
    });
    expect(email.text.split('\n')[0]).toBe(
      'Cole, Jordan Rivera was hired. Please add them to payroll.'
    );
  });

  it('classifies other handoffs into separate event keys', () => {
    expect(payrollEventKey(handoff({ change_type: 'rate' }))).toBe('pay_type');
    expect(payrollEventKey(handoff({ change_type: 'benefits' }))).toBe('benefits');
    expect(payrollEventKey(handoff({ change_type: 'other' }))).toBe('manual');
    expect(
      payrollEventKey(handoff({ change_type: 'status', payload: { from: 'TERMINATED', to: 'ACTIVE' } }))
    ).toBe('rehire');
    expect(
      payrollEventKey(handoff({ change_type: 'status', payload: { from: 'ACTIVE', to: 'LEAVE' } }))
    ).toBe('status_change');
    expect(
      payrollEventKey(
        handoff({ change_type: 'status', payload: { leave_request_id: 'l1', leave_type: 'unpaid' } })
      )
    ).toBe('unpaid_leave');
    expect(
      payrollEventKey(
        handoff({ change_type: 'status', payload: { leave_request_id: 'l1', leave_type: 'pto' } })
      )
    ).toBe('paid_leave');
  });

  it('only emails hires and terminations by default', () => {
    expect([...parsePayrollNotifyEvents(undefined)]).toEqual(['new_hire', 'termination']);
    expect([...parsePayrollNotifyEvents('new_hire, termination, rehire, bogus')]).toEqual([
      'new_hire',
      'termination',
      'rehire',
    ]);
  });

  it('parses and de-duplicates recipients', () => {
    expect(parseRecipientEmails('Cole.Woolard@btwglobal.com, cole.woolard@btwglobal.com;bad')).toEqual([
      'cole.woolard@btwglobal.com',
    ]);
    expect(parseRecipientEmails('')).toEqual([]);
  });

  it('claims the handoff before sending so it emails at most once', () => {
    const source = readFileSync(
      join(process.cwd(), 'supabase/functions/notify-payroll-change/index.ts'),
      'utf8'
    );
    const claim = source.indexOf(".is('payroll_email_sent_at', null)");
    const send = source.indexOf('await sendSmtpEmail(');
    expect(claim).toBeGreaterThan(0);
    expect(send).toBeGreaterThan(claim);
    expect(source).toContain("requireOrbisAuth(req, 'orbis_access_is_approved'");
    // Non-admins are limited to leave handoffs they may approve, checked before any send.
    const adminCheck = source.indexOf("'orbis_is_admin'");
    const approverCheck = source.indexOf("'orbis_can_approve_leave_request'");
    expect(adminCheck).toBeGreaterThan(0);
    expect(approverCheck).toBeGreaterThan(adminCheck);
    expect(claim).toBeGreaterThan(approverCheck);
  });
});
