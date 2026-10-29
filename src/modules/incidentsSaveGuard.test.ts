import { describe, expect, it, vi } from 'vitest';

const { saveEmployeeRecordRow, getDrawerEmployee, getEmployeeId } = vi.hoisted(() => ({
  saveEmployeeRecordRow: vi.fn(),
  getDrawerEmployee: vi.fn(() => ({ id: 'emp-1' })),
  getEmployeeId: vi.fn(() => 'emp-1'),
}));

vi.mock('../services/employeeRecordCrud', () => ({
  bindHistoryItemActions: vi.fn(),
  clearRecordEditModeUi: vi.fn(),
  deleteEmployeeRecordRow: vi.fn(),
  getDrawerEmployee,
  getEmployeeId,
  loadEmployeeRecordHistory: vi.fn(),
  saveEmployeeRecordRow,
  setDrawerInputValue: vi.fn(),
  setRecordEditModeUi: vi.fn(),
}));
vi.mock('../services/derivedDataRefresh', () => ({ refreshDerivedUiProfile: vi.fn() }));
vi.mock('../utils/helpers', () => ({
  esc: (v: unknown) => String(v ?? ''),
  nl2br: (v: unknown) => String(v ?? ''),
  safeGet: (id: string) => (id === 'incidentType' ? { value: 'Slip and fall' } : null),
  showToast: vi.fn(),
  todayInputValue: () => '2026-10-29',
}));
vi.mock('../ui/signaturePads', () => ({
  clearCanvasSignature: vi.fn(),
  getCanvasSignature: vi.fn(() => ''),
  setCanvasSignature: vi.fn(),
}));
vi.mock('./dictation', () => ({ stopAllDictation: vi.fn() }));

vi.stubGlobal('window', {});

const { saveIncidentRecord } = await import('./incidents');
const { showToast } = await import('../utils/helpers');

describe('saveIncidentRecord double-submit guard', () => {
  it('rejects a second concurrent save while the first is still in flight', async () => {
    let resolveFirst: ((value: { data: unknown[]; error: null }) => void) | undefined;
    saveEmployeeRecordRow.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      })
    );

    const firstSave = saveIncidentRecord();
    const secondSave = saveIncidentRecord();

    await secondSave;
    expect(showToast).toHaveBeenCalledWith('Incident save already in progress. Please wait.', 'error');
    expect(saveEmployeeRecordRow).toHaveBeenCalledTimes(1);

    resolveFirst?.({ data: [{ id: 'inc-1', employee_id: 'emp-1' }], error: null });
    await firstSave;
  });

  it('allows a new save once the previous one has finished', async () => {
    vi.mocked(showToast).mockClear();
    saveEmployeeRecordRow.mockClear();
    saveEmployeeRecordRow.mockResolvedValue({ data: [{ id: 'inc-2', employee_id: 'emp-1' }], error: null });

    await saveIncidentRecord();

    expect(saveEmployeeRecordRow).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalledWith('Incident save already in progress. Please wait.', 'error');
  });
});
