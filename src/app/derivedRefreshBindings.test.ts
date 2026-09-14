import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => ({
  summary: vi.fn(), inbox: vi.fn(), attentionSummary: vi.fn(),
  attentionWorkspace: vi.fn(), managerHome: vi.fn(), basicKpis: vi.fn(),
}));
vi.mock('../ui/kpis', () => ({ loadSummaryMetrics: handlers.summary, renderBasicDashboardKpis: handlers.basicKpis }));
vi.mock('../ui/hrInbox', () => ({ loadHrInbox: handlers.inbox }));
vi.mock('../services/attention/attentionSummary', () => ({ loadAttentionSummary: handlers.attentionSummary }));
vi.mock('../ui/attentionWorkspace', () => ({ loadAttentionWorkspaceUi: handlers.attentionWorkspace }));
vi.mock('../modules/managerHome', () => ({ loadManagerHome: handlers.managerHome }));

describe('application refresh wiring', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects use before startup wiring instead of silently skipping refreshes', async () => {
    const service = await import('../services/derivedDataRefresh');
    await expect(service.refreshDerivedUiProfile('care')).rejects.toThrow('not configured');
  });

  it('wires real module exports without invoking them until a refresh is requested', async () => {
    const { initializeDerivedRefreshBindings } = await import('./derivedRefreshBindings');
    const service = await import('../services/derivedDataRefresh');
    initializeDerivedRefreshBindings();
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled();
    await service.refreshDerivedUiProfile('employeeLifecycle');
    expect(handlers.summary).toHaveBeenCalledTimes(1);
    expect(handlers.inbox).toHaveBeenCalledWith(true);
    expect(handlers.attentionWorkspace).toHaveBeenCalledWith(true);
    expect(handlers.managerHome).toHaveBeenCalledWith(true);
    expect(handlers.basicKpis).toHaveBeenCalledTimes(1);
    expect(handlers.attentionSummary).not.toHaveBeenCalled();
    await service.refreshDerivedUiAfterMutation({ attention: true });
    expect(handlers.attentionSummary).toHaveBeenCalledWith(true);
  });
});
