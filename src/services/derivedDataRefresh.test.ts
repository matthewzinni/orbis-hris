import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DERIVED_REFRESH_PROFILES,
  configureDerivedUiRefresh,
  createDerivedUiRefresher,
  refreshDerivedUiAfterMutation,
  refreshDerivedUiProfile,
} from './derivedDataRefresh';
import { isOpenDisciplineStatus } from './hrIntelligence';

describe('isOpenDisciplineStatus', () => {
  it('treats Open and Pending Follow-Up as open', () => {
    expect(isOpenDisciplineStatus('Open')).toBe(true);
    expect(isOpenDisciplineStatus('Pending Follow-Up')).toBe(true);
    expect(isOpenDisciplineStatus('pending')).toBe(true);
    expect(isOpenDisciplineStatus('')).toBe(true);
  });

  it('treats Closed as not open', () => {
    expect(isOpenDisciplineStatus('Closed')).toBe(false);
    expect(isOpenDisciplineStatus('closed')).toBe(false);
  });

  it('does not treat arbitrary non-closed statuses as open', () => {
    expect(isOpenDisciplineStatus('Under Review')).toBe(false);
  });
});

describe('refreshDerivedUiAfterMutation', () => {
  const handlers = () => ({
    summary: vi.fn(async () => undefined),
    inbox: vi.fn(async (_force: boolean) => undefined),
    attentionSummary: vi.fn(async (_force: boolean) => undefined),
    attentionWorkspace: vi.fn(async (_force: boolean) => undefined),
    managerHome: vi.fn(async (_force: boolean) => undefined),
    basicKpis: vi.fn(),
  });
  let dependencies: ReturnType<typeof handlers>;

  beforeEach(() => {
    dependencies = handlers();
    configureDerivedUiRefresh(dependencies);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('force-refetches inbox and manager home when requested', async () => {
    const summary = vi.fn(async () => undefined);
    const inbox = vi.fn(async () => undefined);
    const managerHome = vi.fn(async () => undefined);
    const basic = vi.fn();

    configureDerivedUiRefresh({ ...dependencies, summary, inbox, managerHome, basicKpis: basic });

    await refreshDerivedUiAfterMutation({
      summary: true,
      inbox: true,
      managerHome: true,
      basicKpis: true,
    });

    expect(summary).toHaveBeenCalledTimes(1);
    expect(inbox).toHaveBeenCalledWith(true);
    expect(managerHome).toHaveBeenCalledWith(true);
    expect(basic).toHaveBeenCalledTimes(1);
  });

  it('discipline profile refreshes summary, inbox, and manager home', async () => {
    const summary = vi.fn(async () => undefined);
    const inbox = vi.fn(async () => undefined);
    const managerHome = vi.fn(async () => undefined);

    configureDerivedUiRefresh({ ...dependencies, summary, inbox, managerHome });

    expect(DERIVED_REFRESH_PROFILES.discipline).toEqual({
      summary: true,
      inbox: true,
      managerHome: true,
      attention: true,
    });

    await refreshDerivedUiProfile('discipline');

    expect(summary).toHaveBeenCalled();
    expect(inbox).toHaveBeenCalledWith(true);
    expect(managerHome).toHaveBeenCalledWith(true);
  });

  it('care and policy campaign profiles force inbox refresh', async () => {
    const inbox = vi.fn(async () => undefined);
    configureDerivedUiRefresh({ ...dependencies, inbox });

    expect(DERIVED_REFRESH_PROFILES.care).toEqual({ inbox: true });
    expect(DERIVED_REFRESH_PROFILES.policyCampaigns).toEqual({ inbox: true });

    await refreshDerivedUiProfile('care');
    await refreshDerivedUiProfile('policyCampaigns');

    expect(inbox).toHaveBeenCalledTimes(2);
    expect(inbox).toHaveBeenCalledWith(true);
  });

  it('runs with no browser globals', async () => {
    vi.stubGlobal('window', undefined);
    await refreshDerivedUiProfile('employeeLifecycle');
    expect(dependencies.summary).toHaveBeenCalledTimes(1);
    expect(dependencies.inbox).toHaveBeenCalledWith(true);
    expect(dependencies.attentionWorkspace).toHaveBeenCalledWith(true);
    expect(dependencies.managerHome).toHaveBeenCalledWith(true);
    expect(dependencies.basicKpis).toHaveBeenCalledTimes(1);
  });

  it('does not run unrequested handlers', async () => {
    await refreshDerivedUiAfterMutation({});
    for (const handler of Object.values(dependencies)) expect(handler).not.toHaveBeenCalled();
    await refreshDerivedUiProfile('attendance');
    expect(dependencies.basicKpis).toHaveBeenCalledTimes(1);
    expect(dependencies.inbox).not.toHaveBeenCalled();
    expect(dependencies.attentionWorkspace).not.toHaveBeenCalled();
  });

  it('refreshes attention directly only when an inbox refresh is not requested', async () => {
    await refreshDerivedUiAfterMutation({ attention: true });
    expect(dependencies.attentionSummary).toHaveBeenCalledWith(true);
    expect(dependencies.attentionWorkspace).toHaveBeenCalledWith(true);
    expect(dependencies.inbox).not.toHaveBeenCalled();
    dependencies.attentionSummary.mockClear();
    await refreshDerivedUiAfterMutation({ inbox: true, attention: true });
    expect(dependencies.attentionSummary).not.toHaveBeenCalled();
    expect(dependencies.inbox).toHaveBeenCalledWith(true);
  });

  it('waits for asynchronous handlers to complete', async () => {
    let finish: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const refresher = createDerivedUiRefresher({ ...dependencies, inbox: () => pending });
    let completed = false;
    const refresh = refresher.refreshProfile('care').then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    finish();
    await refresh;
    expect(completed).toBe(true);
  });

  it('reports synchronous failures without skipping other requested refreshes', async () => {
    const refresher = createDerivedUiRefresher({
      ...dependencies,
      summary: () => { throw new Error('summary failed'); },
    });
    await expect(refresher.refreshProfile('reviews')).rejects.toThrow('summary failed');
    expect(dependencies.inbox).toHaveBeenCalledWith(true);
    expect(dependencies.managerHome).toHaveBeenCalledWith(true);
    expect(dependencies.basicKpis).toHaveBeenCalledTimes(1);
  });

  it('propagates asynchronous failures', async () => {
    dependencies.inbox.mockRejectedValueOnce(new Error('inbox failed'));
    await expect(refreshDerivedUiProfile('care')).rejects.toThrow('inbox failed');
  });

  it('keeps separately constructed coordinators independent', async () => {
    const other = handlers();
    const first = createDerivedUiRefresher(dependencies);
    const second = createDerivedUiRefresher(other);
    await first.refreshProfile('care');
    expect(other.inbox).not.toHaveBeenCalled();
    await second.refreshProfile('attendance');
    expect(dependencies.basicKpis).not.toHaveBeenCalled();
    expect(other.basicKpis).toHaveBeenCalledTimes(1);
  });

  it('filters deleted/closed discipline out of open lists using canonical predicate', () => {
    const rows = [
      { id: 1, report_status: 'Open' },
      { id: 2, report_status: 'Closed' },
      { id: 3, report_status: 'Pending Follow-Up' },
    ];
    const open = rows.filter((row) => isOpenDisciplineStatus(row.report_status));
    expect(open.map((row) => row.id)).toEqual([1, 3]);
  });
});
