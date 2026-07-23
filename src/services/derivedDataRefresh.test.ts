import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DERIVED_REFRESH_PROFILES,
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
  beforeEach(() => {
    (globalThis as { window?: Window & typeof globalThis }).window = globalThis as unknown as Window &
      typeof globalThis;
  });

  afterEach(() => {
    delete window.loadSummaryMetrics;
    delete window.loadHrInbox;
    delete window.loadManagerHome;
    delete window.renderBasicDashboardKpis;
  });

  it('force-refetches inbox and manager home when requested', async () => {
    const summary = vi.fn(async () => undefined);
    const inbox = vi.fn(async () => undefined);
    const managerHome = vi.fn(async () => undefined);
    const basic = vi.fn();

    window.loadSummaryMetrics = summary;
    window.loadHrInbox = inbox;
    window.loadManagerHome = managerHome;
    window.renderBasicDashboardKpis = basic;

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

    window.loadSummaryMetrics = summary;
    window.loadHrInbox = inbox;
    window.loadManagerHome = managerHome;

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
    window.loadHrInbox = inbox;

    expect(DERIVED_REFRESH_PROFILES.care).toEqual({ inbox: true });
    expect(DERIVED_REFRESH_PROFILES.policyCampaigns).toEqual({ inbox: true });

    await refreshDerivedUiProfile('care');
    await refreshDerivedUiProfile('policyCampaigns');

    expect(inbox).toHaveBeenCalledTimes(2);
    expect(inbox).toHaveBeenCalledWith(true);
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
