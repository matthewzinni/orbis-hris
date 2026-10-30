import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isAdminUser, isSupervisorUser, employeeMatchesSupervisorAccess } = vi.hoisted(() => ({
  isAdminUser: vi.fn((): boolean => false),
  isSupervisorUser: vi.fn((): boolean => true),
  employeeMatchesSupervisorAccess: vi.fn((_employee?: { id: string } | null): boolean => false),
}));

vi.mock('./access', () => ({ isAdminUser, isSupervisorUser, employeeMatchesSupervisorAccess }));

const { findCareEmployeeById } = vi.hoisted(() => ({ findCareEmployeeById: vi.fn() }));
vi.mock('./careEmployeePicker', () => ({ findCareEmployeeById }));

import { filterCareEngagementDatasetForViewer } from './careConfidentiality';
import type { CareEngagementDataset } from '../types/careEngagementTypes';

function baseDataset(overrides: Partial<CareEngagementDataset> = {}): CareEngagementDataset {
  return {
    careItems: [],
    employeeNotes: [],
    recognition: [
      { id: 'r1', employeeId: 'own-report' } as never,
      { id: 'r2', employeeId: 'other-team' } as never,
    ],
    followUps: [{ id: 'f1', employeeId: 'other-team' } as never],
    resources: [{ id: 's1', employeeId: 'other-team' } as never],
    wellnessCheckIns: [{ id: 'w1', employeeId: 'other-team' } as never],
    ...overrides,
  } as CareEngagementDataset;
}

describe('filterCareEngagementDatasetForViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminUser.mockReturnValue(false);
    isSupervisorUser.mockReturnValue(true);
  });

  it('a supervisor only sees follow-ups/resources/check-ins/recognition for their own scope', () => {
    findCareEmployeeById.mockImplementation((id: string) => ({ id }));
    employeeMatchesSupervisorAccess.mockImplementation((emp: { id: string }) => emp.id === 'own-report');

    const result = filterCareEngagementDatasetForViewer(baseDataset());

    expect(result.recognition).toHaveLength(1);
    expect(result.recognition[0]).toMatchObject({ employeeId: 'own-report' });
    expect(result.followUps).toHaveLength(0);
    expect(result.resources).toHaveLength(0);
    expect(result.wellnessCheckIns).toHaveLength(0);
  });

  it('admins see everything unfiltered', () => {
    isAdminUser.mockReturnValue(true);

    const dataset = baseDataset();
    const result = filterCareEngagementDatasetForViewer(dataset);

    expect(result).toBe(dataset);
  });
});
