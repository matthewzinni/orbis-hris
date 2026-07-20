/**
 * Central invalidation for dashboard / inbox / manager-home derived views.
 * Mutations must call this instead of ad-hoc basic KPI refresh or no-force inbox loads.
 */

export type DerivedRefreshOptions = {
  /** Re-fetch open discipline, at-risk, impact, intelligence context. */
  summary?: boolean;
  /** Force-refetch HR inbox (`loadHrInbox(true)`). */
  inbox?: boolean;
  /** Force-refetch supervisor manager home. */
  managerHome?: boolean;
  /** Roster-only KPI cards (headcount, anniversaries, etc.). */
  basicKpis?: boolean;
};

/** Profiles used by domain mutations. */
export const DERIVED_REFRESH_PROFILES = {
  discipline: { summary: true, inbox: true, managerHome: true } satisfies DerivedRefreshOptions,
  notes: { summary: true, inbox: true, managerHome: true } satisfies DerivedRefreshOptions,
  flags: { summary: true, inbox: true, managerHome: true } satisfies DerivedRefreshOptions,
  stay: { summary: true, inbox: true, managerHome: true } satisfies DerivedRefreshOptions,
  reviews: {
    summary: true,
    inbox: true,
    managerHome: true,
    basicKpis: true,
  } satisfies DerivedRefreshOptions,
  incidents: { summary: true, inbox: true, basicKpis: true } satisfies DerivedRefreshOptions,
  meetings: { summary: true, inbox: true, basicKpis: true } satisfies DerivedRefreshOptions,
  investigations: { summary: true, inbox: true } satisfies DerivedRefreshOptions,
  operations: { summary: true, inbox: true } satisfies DerivedRefreshOptions,
  care: { inbox: true } satisfies DerivedRefreshOptions,
  onboarding: { inbox: true } satisfies DerivedRefreshOptions,
  leave: { inbox: true, managerHome: true } satisfies DerivedRefreshOptions,
  jobBoard: { inbox: true } satisfies DerivedRefreshOptions,
  employeeLifecycle: {
    summary: true,
    inbox: true,
    managerHome: true,
    basicKpis: true,
  } satisfies DerivedRefreshOptions,
} as const;

export type DerivedRefreshProfile = keyof typeof DERIVED_REFRESH_PROFILES;

export async function refreshDerivedUiAfterMutation(
  options: DerivedRefreshOptions
): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  if (options.summary && typeof window.loadSummaryMetrics === 'function') {
    tasks.push(Promise.resolve(window.loadSummaryMetrics()));
  }

  if (options.inbox && typeof window.loadHrInbox === 'function') {
    tasks.push(Promise.resolve(window.loadHrInbox(true)));
  }

  if (options.managerHome && typeof window.loadManagerHome === 'function') {
    tasks.push(Promise.resolve(window.loadManagerHome(true)));
  }

  if (options.basicKpis && typeof window.renderBasicDashboardKpis === 'function') {
    window.renderBasicDashboardKpis();
  }

  if (tasks.length) {
    await Promise.all(tasks);
  }
}

export async function refreshDerivedUiProfile(
  profile: DerivedRefreshProfile
): Promise<void> {
  await refreshDerivedUiAfterMutation(DERIVED_REFRESH_PROFILES[profile]);
}
