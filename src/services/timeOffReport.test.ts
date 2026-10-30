import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabaseClient: { functions: { invoke: vi.fn() } },
}));

import { mondayOfWeek } from './timeOffReport';

describe('mondayOfWeek', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    // Force a host timezone far from America/New_York so the test actually exercises the
    // "don't use the browser/host local date" fix, regardless of what timezone CI runs in.
    process.env.TZ = 'Pacific/Kiritimati'; // UTC+14
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('uses the America/New_York calendar date, not the host/browser local date', () => {
    // 2026-10-26T03:00:00Z is Monday in UTC, but still Sunday 2026-10-25 in America/New_York
    // (EDT, UTC-4, before the Nov 1 2026 DST change) -- and already Monday Oct 26 (or later)
    // in a UTC+14 host. The Monday of the ET week is Oct 19; a host-local implementation run
    // from a UTC+14 machine would wrongly answer Oct 26.
    expect(mondayOfWeek(new Date('2026-10-26T03:00:00Z'))).toBe('2026-10-19');
  });

  it('returns the same week for any instant still within that ET calendar week', () => {
    // 2026-10-28 (Wed) at noon ET is unambiguously within the week starting Monday Oct 26.
    expect(mondayOfWeek(new Date('2026-10-28T16:00:00Z'))).toBe('2026-10-26');
  });

  it('rolls over correctly across a DST transition week', () => {
    // 2026-11-02 is the Monday after the Nov 1 2026 "fall back" DST transition.
    expect(mondayOfWeek(new Date('2026-11-03T15:00:00Z'))).toBe('2026-11-02');
  });
});
