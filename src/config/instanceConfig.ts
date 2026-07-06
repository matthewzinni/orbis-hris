/**
 * Per-instance settings for dedicated Orbis deployments.
 *
 * BTW Global is the default when env vars are unset — production behavior unchanged.
 * Future UI/email/SQL consumers should read from here instead of hardcoding company names.
 */

export type InstanceFeatures = {
  janus: boolean;
  investigations: boolean;
  careEngagement: boolean;
  candidates: boolean;
};

export type InstanceConfig = {
  /** True when VITE_DEMO_INSTANCE is set (training / demo deploy only). */
  isDemoInstance: boolean;
  /** Short name shown in UI (e.g. sidebar). */
  companyName: string;
  /** Legal entity for footers and PDFs. */
  companyLegalName: string;
  /** Primary work email domain for roster matching hints. */
  companyEmailDomain: string;
  /** Product name (Orbis stays constant across white-label HRIS). */
  appProductName: string;
  /** Employee display ID prefix (BTW → BTW2601). */
  employeeIdPrefix: string;
  /** HR leadership with org-wide attendance / performance-review scope. */
  orgWideScopeEmails: readonly string[];
  /** HR leadership with org-wide discipline dashboards and cross-team discipline CRUD. */
  orgWideDisciplineEmails: readonly string[];
  /** Emails that must never auto-provision as employee portal users. */
  leadershipPortalExcludeEmails: readonly string[];
  featureFlags: InstanceFeatures;
};

/** BTW Global production defaults — do not change without intentional BTW ops review. */
export const BTW_DEFAULT_ORG_WIDE_SCOPE_EMAILS = [
  'matthew.zinni@btwglobal.com',
  'trent.wynne@btwglobal.com',
  'brent.wynne@btwglobal.com',
  'david.allewalt@btwglobal.com',
] as const;

export const BTW_DEFAULT_ORG_WIDE_DISCIPLINE_EMAILS = [
  'matthew.zinni@btwglobal.com',
  'david.allewalt@btwglobal.com',
] as const;

export const BTW_DEFAULT_LEADERSHIP_PORTAL_EXCLUDE_EMAILS = [
  ...BTW_DEFAULT_ORG_WIDE_SCOPE_EMAILS,
] as const;

export const BTW_DEFAULT_INSTANCE_CONFIG: InstanceConfig = {
  isDemoInstance: false,
  companyName: 'BTW Global',
  companyLegalName: 'BTW Global, LLC',
  companyEmailDomain: 'btwglobal.com',
  appProductName: 'Orbis',
  employeeIdPrefix: 'BTW',
  orgWideScopeEmails: BTW_DEFAULT_ORG_WIDE_SCOPE_EMAILS,
  orgWideDisciplineEmails: BTW_DEFAULT_ORG_WIDE_DISCIPLINE_EMAILS,
  leadershipPortalExcludeEmails: BTW_DEFAULT_LEADERSHIP_PORTAL_EXCLUDE_EMAILS,
  featureFlags: {
    janus: true,
    investigations: true,
    careEngagement: true,
    candidates: true,
  },
};

function readEnv(key: string): string {
  const meta = import.meta as { env?: Record<string, string | undefined> };
  return String(meta.env?.[key] || '').trim();
}

function parseEmailList(raw: string, fallback: readonly string[]): readonly string[] {
  const values = raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return values.length ? values : fallback;
}

function parseBooleanEnv(key: string, defaultValue: boolean): boolean {
  const raw = readEnv(key).toLowerCase();
  if (!raw) return defaultValue;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return defaultValue;
}

/** Resolved config for this deploy (env overrides with BTW fallbacks). */
export function getInstanceConfig(): InstanceConfig {
  const defaults = BTW_DEFAULT_INSTANCE_CONFIG;

  return {
    isDemoInstance: parseBooleanEnv('VITE_DEMO_INSTANCE', defaults.isDemoInstance),
    companyName: readEnv('VITE_COMPANY_NAME') || defaults.companyName,
    companyLegalName: readEnv('VITE_COMPANY_LEGAL_NAME') || defaults.companyLegalName,
    companyEmailDomain: readEnv('VITE_COMPANY_EMAIL_DOMAIN') || defaults.companyEmailDomain,
    appProductName: readEnv('VITE_APP_PRODUCT_NAME') || defaults.appProductName,
    employeeIdPrefix: readEnv('VITE_EMPLOYEE_ID_PREFIX') || defaults.employeeIdPrefix,
    orgWideScopeEmails: parseEmailList(readEnv('VITE_ORG_WIDE_SCOPE_EMAILS'), defaults.orgWideScopeEmails),
    orgWideDisciplineEmails: parseEmailList(
      readEnv('VITE_ORG_WIDE_DISCIPLINE_EMAILS'),
      defaults.orgWideDisciplineEmails
    ),
    leadershipPortalExcludeEmails: parseEmailList(
      readEnv('VITE_LEADERSHIP_PORTAL_EXCLUDE_EMAILS'),
      defaults.leadershipPortalExcludeEmails
    ),
    featureFlags: {
      janus: parseBooleanEnv('VITE_FEATURE_JANUS', defaults.featureFlags.janus),
      investigations: parseBooleanEnv('VITE_FEATURE_INVESTIGATIONS', defaults.featureFlags.investigations),
      careEngagement: parseBooleanEnv('VITE_FEATURE_CARE_ENGAGEMENT', defaults.featureFlags.careEngagement),
      candidates: parseBooleanEnv('VITE_FEATURE_CANDIDATES', defaults.featureFlags.candidates),
    },
  };
}

/** Singleton for modules that prefer a stable reference after first read. */
let cachedConfig: InstanceConfig | null = null;

export function instanceConfig(): InstanceConfig {
  if (!cachedConfig) {
    cachedConfig = getInstanceConfig();
  }
  return cachedConfig;
}

export function isDemoInstance(): boolean {
  return instanceConfig().isDemoInstance;
}

/** Test helper — reset memoized config between Vitest cases. */
export function resetInstanceConfigCache(): void {
  cachedConfig = null;
}
