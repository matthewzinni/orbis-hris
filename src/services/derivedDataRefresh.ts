/**
 * Central invalidation for dashboard / inbox / manager-home derived views.
 * Mutations must call this instead of ad-hoc basic KPI refresh or no-force inbox loads.
 */

export type DerivedRefreshOptions = {
  /** Re-fetch open discipline, at-risk, impact, intelligence context. */
  summary?: boolean;
  /** Force-refetch HR inbox (`loadHrInbox(true)`). */
  inbox?: boolean;
  /** Force-refetch unified attention summary/workspace. */
  attention?: boolean;
  /** Force-refetch supervisor manager home. */
  managerHome?: boolean;
  /** Roster-only KPI cards (headcount, anniversaries, etc.). */
  basicKpis?: boolean;
};

/** Profiles used by domain mutations. */
export const DERIVED_REFRESH_PROFILES = {
  discipline: { summary: true, inbox: true, managerHome: true, attention: true } satisfies DerivedRefreshOptions,
  notes: { summary: true, inbox: true, managerHome: true, attention: true } satisfies DerivedRefreshOptions,
  flags: { summary: true, inbox: true, managerHome: true, attention: true } satisfies DerivedRefreshOptions,
  stay: { summary: true, inbox: true, managerHome: true, attention: true } satisfies DerivedRefreshOptions,
  reviews: {
    summary: true,
    inbox: true,
    managerHome: true,
    basicKpis: true,
    attention: true,
  } satisfies DerivedRefreshOptions,
  incidents: { summary: true, inbox: true, basicKpis: true, attention: true } satisfies DerivedRefreshOptions,
  meetings: { summary: true, inbox: true, basicKpis: true, attention: true } satisfies DerivedRefreshOptions,
  investigations: { summary: true, inbox: true } satisfies DerivedRefreshOptions,
  operations: { summary: true, inbox: true } satisfies DerivedRefreshOptions,
  care: { inbox: true } satisfies DerivedRefreshOptions,
  onboarding: { inbox: true } satisfies DerivedRefreshOptions,
  leave: { inbox: true, managerHome: true } satisfies DerivedRefreshOptions,
  jobBoard: { inbox: true } satisfies DerivedRefreshOptions,
  policyCampaigns: { inbox: true } satisfies DerivedRefreshOptions,
  attendance: { basicKpis: true } satisfies DerivedRefreshOptions,
  employeeLifecycle: {
    summary: true,
    inbox: true,
    managerHome: true,
    basicKpis: true,
    attention: true,
  } satisfies DerivedRefreshOptions,
} as const;

export type DerivedRefreshProfile = keyof typeof DERIVED_REFRESH_PROFILES;

/** Required application ports. The coordinator does not import UI implementations. */
export type DerivedRefreshDependencies = Readonly<{
  summary: () => unknown | Promise<unknown>;
  inbox: (force: boolean) => unknown | Promise<unknown>;
  attentionSummary: (force: boolean) => unknown | Promise<unknown>;
  attentionWorkspace: (force: boolean) => unknown | Promise<unknown>;
  managerHome: (force: boolean) => unknown | Promise<unknown>;
  basicKpis: () => unknown | Promise<unknown>;
}>;

export function createDerivedUiRefresher(dependencies: DerivedRefreshDependencies) {
  // Capture the callbacks so later changes to a caller's object cannot rewire us.
  const { summary, inbox, attentionSummary, attentionWorkspace, managerHome, basicKpis } = dependencies;

  async function refreshAfterMutation(options: DerivedRefreshOptions): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    const schedule = (callback: () => unknown) => {
      // A synchronous failure in one handler must not prevent the others starting.
      tasks.push(Promise.resolve().then(callback));
    };

    if (options.summary) schedule(summary);
    if (options.inbox) schedule(() => inbox(true));
    else if (options.attention) schedule(() => attentionSummary(true));
    if (options.attention || options.inbox) schedule(() => attentionWorkspace(true));
    if (options.managerHome) schedule(() => managerHome(true));
    if (options.basicKpis) schedule(basicKpis);

    await Promise.all(tasks);
  }

  return {
    refreshAfterMutation,
    refreshProfile: (profile: DerivedRefreshProfile) => refreshAfterMutation(DERIVED_REFRESH_PROFILES[profile]),
  };
}

let applicationRefresher: ReturnType<typeof createDerivedUiRefresher> | undefined;

/** Called by the application composition layer before auth and protected boot. */
export function configureDerivedUiRefresh(dependencies: DerivedRefreshDependencies): void {
  applicationRefresher = createDerivedUiRefresher(dependencies);
}

function getApplicationRefresher() {
  if (!applicationRefresher) {
    throw new Error('Derived UI refresh is not configured. Initialize application services before mutations.');
  }
  return applicationRefresher;
}

export async function refreshDerivedUiAfterMutation(options: DerivedRefreshOptions): Promise<void> {
  await getApplicationRefresher().refreshAfterMutation(options);
}

export async function refreshDerivedUiProfile(
  profile: DerivedRefreshProfile
): Promise<void> {
  await getApplicationRefresher().refreshProfile(profile);
}
