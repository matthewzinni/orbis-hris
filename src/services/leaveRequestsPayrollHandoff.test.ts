/**
 * Approving leave logs the payroll handoff through orbis_log_leave_payroll_handoff (so
 * supervisors can, not just admins) and asks for exactly one payroll email.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const leaveRow: Row = {};
const updates: Array<{ table: string; values: Row }> = [];
const rpc = vi.fn();
const invoke = vi.fn();
const role = { admin: false, supervisor: true };

vi.mock('./supabaseClient', () => {
  const from = (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      single: async () => ({ data: { ...leaveRow }, error: null }),
      insert: () => {
        throw new Error(`Unexpected direct insert into ${table}`);
      },
      update: (values: Row) => {
        updates.push({ table, values });
        return { eq: async () => ({ error: null }) };
      },
    };
    return builder;
  };
  return {
    supabaseClient: {
      from,
      rpc: (...args: unknown[]) => rpc(...args),
      functions: { invoke: (...args: unknown[]) => invoke(...args) },
    },
  };
});

vi.mock('./access', () => ({
  employeeMatchesSupervisorAccess: () => true,
  getCurrentUserAccess: () => ({ email: 'supervisor@example.com' }),
  getLinkedEmployeeId: () => null,
  isAdminUser: () => role.admin,
  isEmployeeUser: () => false,
  isSupervisorUser: () => role.supervisor,
}));

vi.mock('./leaveQbtPush', () => ({
  pushLeaveToQbt: vi.fn(async () => undefined),
  cancelLeaveInQbt: vi.fn(async () => undefined),
}));

vi.mock('./employeeUtils', () => ({ employeeDisplayName: () => 'Jordan Rivera' }));

describe('approveLeaveRequest payroll handoff', () => {
  beforeEach(() => {
    Object.assign(leaveRow, {
      id: 'lr-1',
      employee_id: 'BTW2150',
      leave_type: 'unpaid',
      start_date: '2099-12-01',
      end_date: '2099-12-03',
      status: 'requested',
      payroll_notified: false,
    });
    updates.length = 0;
    rpc.mockReset();
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    role.admin = false;
    role.supervisor = true;
    (window as unknown as Row).EMPLOYEES = [{ id: 'BTW2150' }];
  });

  it('logs one handoff server-side and requests one email when a supervisor approves', async () => {
    rpc.mockResolvedValue({ data: 'handoff-1', error: null });
    const { approveLeaveRequest } = await import('./leaveRequests');

    await expect(approveLeaveRequest('lr-1')).resolves.toEqual({ payrollNotified: true });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('orbis_log_leave_payroll_handoff', { p_leave_request_id: 'lr-1' });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('notify-payroll-change', { body: { handoff_id: 'handoff-1' } });
    expect(updates).toContainEqual(
      expect.objectContaining({ table: 'leave_requests', values: expect.objectContaining({ status: 'approved' }) })
    );
  });

  it('uses the same path when an admin approves', async () => {
    role.admin = true;
    role.supervisor = false;
    rpc.mockResolvedValue({ data: 'handoff-2', error: null });
    const { approveLeaveRequest } = await import('./leaveRequests');

    await expect(approveLeaveRequest('lr-1')).resolves.toEqual({ payrollNotified: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('notify-payroll-change', { body: { handoff_id: 'handoff-2' } });
  });

  it('does not email again when the request was already logged for payroll', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { approveLeaveRequest } = await import('./leaveRequests');

    await expect(approveLeaveRequest('lr-1')).resolves.toEqual({ payrollNotified: true });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('skips the handoff when the leave request is already marked payroll_notified', async () => {
    leaveRow.payroll_notified = true;
    const { approveLeaveRequest } = await import('./leaveRequests');

    await expect(approveLeaveRequest('lr-1')).resolves.toEqual({ payrollNotified: true });
    expect(rpc).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('keeps the approval and reports it when logging the handoff fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { approveLeaveRequest } = await import('./leaveRequests');

    await expect(approveLeaveRequest('lr-1')).resolves.toEqual({ payrollNotified: false });
    expect(invoke).not.toHaveBeenCalled();
    expect(updates).toContainEqual(
      expect.objectContaining({ table: 'leave_requests', values: expect.objectContaining({ status: 'approved' }) })
    );
    error.mockRestore();
  });

  it('keeps the approval when the handoff call itself throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpc.mockRejectedValue(new Error('network down'));
    const { approveLeaveRequest } = await import('./leaveRequests');

    await expect(approveLeaveRequest('lr-1')).resolves.toEqual({ payrollNotified: false });
    error.mockRestore();
  });
});
