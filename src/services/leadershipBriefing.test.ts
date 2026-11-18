import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: true, from: vi.fn(), attendance: vi.fn() }));
vi.mock('./accessState', () => ({ isAdminUser: () => mocks.admin }));
vi.mock('./supabaseClient', () => ({ supabaseClient: { from: mocks.from } }));
vi.mock('./attendance', () => ({ loadManualAttendanceSnapshot: mocks.attendance }));
import { generateLeadershipBriefing, listLeadershipBriefings, saveLeadershipBriefing } from './leadershipBriefing';
import { buildLeadershipBriefing, type BriefingSource } from './leadershipBriefingModel';

beforeEach(() => { mocks.admin = true; mocks.from.mockReset(); mocks.attendance.mockReset(); });
describe('briefing access and data loading', () => {
  it('rejects non-admin generation and history before requesting any records', async () => {
    mocks.admin = false;
    await expect(generateLeadershipBriefing('2026-08-24', '2026-08-30', '2026-09-02')).rejects.toThrow('Admin');
    await expect(listLeadershipBriefings()).rejects.toThrow('Admin');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('uses paginated allowlisted queries and preserves source failures', async () => {
    const selected: string[] = [];
    mocks.from.mockImplementation((table: string) => ({ select: (fields: string) => {
      selected.push(fields);
      return { order: () => ({ range: async (offset: number) => {
        if (table === 'employee_reviews') return { data: null, error: { message: 'denied' } };
        return { data: table === 'employees' && offset === 0 ? Array.from({ length: 500 }, (_, i) => ({ id: String(i), hire_date: '2026-08-24' })) : [], error: null };
      } }) };
    } }));
    mocks.attendance.mockResolvedValue(null);
    const brief = await generateLeadershipBriefing('2026-08-24', '2026-08-30', '2026-09-02');
    expect(brief.metrics[0].value).toBe('500');
    expect(brief.metrics[2].value).toBe('Unavailable');
    expect(selected.every(s => !s.includes('*') && !s.includes('signature') && !s.includes('comments'))).toBe(true);
    expect(mocks.attendance).toHaveBeenCalledTimes(14);
  });
  it('reports save failures without claiming success', async () => {
    const sources = Object.fromEntries(['employees', 'reviews', 'onboarding', 'training', 'attendance', 'previousAttendance'].map(key => [key, { label: key, rows: [] }])) as Record<string, BriefingSource>;
    const brief = buildLeadershipBriefing('2026-08-24', '2026-08-30', sources, '2026-09-02');
    mocks.from.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: { message: 'missing table' } }) });
    await expect(saveLeadershipBriefing(brief)).rejects.toThrow('not saved');
    mocks.admin = false;
    await expect(saveLeadershipBriefing(brief)).rejects.toThrow('Admin');
  });
});
