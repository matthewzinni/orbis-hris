import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  BTW_DEFAULT_INSTANCE_CONFIG,
  getInstanceConfig,
  resetInstanceConfigCache,
} from './instanceConfig';

describe('instanceConfig', () => {
  beforeEach(() => {
    resetInstanceConfigCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetInstanceConfigCache();
  });

  it('returns BTW defaults when env is unset', () => {
    const config = getInstanceConfig();
    expect(config.isDemoInstance).toBe(false);
    expect(config.companyName).toBe('BTW Global');
    expect(config.companyLegalName).toBe('BTW Global, LLC');
    expect(config.employeeIdPrefix).toBe('BTW');
    expect(config.orgWideScopeEmails).toEqual([
      'matthew.zinni@btwglobal.com',
      'trent.wynne@btwglobal.com',
      'brent.wynne@btwglobal.com',
      'david.allewalt@btwglobal.com',
    ]);
    expect(config.orgWideDisciplineEmails).toEqual([
      'matthew.zinni@btwglobal.com',
      'david.allewalt@btwglobal.com',
    ]);
    expect(config.featureFlags.janus).toBe(true);
  });

  it('applies VITE_* overrides when set', () => {
    vi.stubEnv('VITE_COMPANY_NAME', 'Acme Manufacturing');
    vi.stubEnv('VITE_EMPLOYEE_ID_PREFIX', 'ACME');
    vi.stubEnv('VITE_ORG_WIDE_SCOPE_EMAILS', 'hr@acme.com, ceo@acme.com');
    vi.stubEnv('VITE_ORG_WIDE_DISCIPLINE_EMAILS', 'hr@acme.com');
    vi.stubEnv('VITE_FEATURE_JANUS', 'false');

    const config = getInstanceConfig();
    expect(config.companyName).toBe('Acme Manufacturing');
    expect(config.employeeIdPrefix).toBe('ACME');
    expect(config.orgWideScopeEmails).toEqual(['hr@acme.com', 'ceo@acme.com']);
    expect(config.orgWideDisciplineEmails).toEqual(['hr@acme.com']);
    expect(config.featureFlags.janus).toBe(false);
    expect(config.featureFlags.investigations).toBe(BTW_DEFAULT_INSTANCE_CONFIG.featureFlags.investigations);
  });

  it('enables demo instance banner when VITE_DEMO_INSTANCE is true', () => {
    vi.stubEnv('VITE_DEMO_INSTANCE', 'true');
    vi.stubEnv('VITE_COMPANY_NAME', 'Northline Manufacturing');

    const config = getInstanceConfig();
    expect(config.isDemoInstance).toBe(true);
    expect(config.companyName).toBe('Northline Manufacturing');
  });
});
