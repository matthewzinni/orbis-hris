import { describe, expect, it } from 'vitest';
import { getEmployeeIronShiftMetaFromBadges } from '../ui/badges';

describe('iron shift roster badges', () => {
  it('resolves iron shift meta by employee alias keys', () => {
    window.currentIronShiftRosterMap = {
      BTW2509: {
        summary: 'Led overnight recovery effort',
        recognizedOn: '2026-07-01',
        recognizedBy: 'HR',
        awardCount: 1,
      },
    };

    const meta = getEmployeeIronShiftMetaFromBadges({
      id: 'BTW2509',
      dbId: 'BTW2509',
    });

    expect(meta?.summary).toBe('Led overnight recovery effort');
    expect(meta?.awardCount).toBe(1);
  });
});
