import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => ({
  canAccessPerformanceReviews: vi.fn(),
  loadEmployeeInternalJobInterests: vi.fn(),
  loadEmployeeNotes: vi.fn(),
  loadEmployeeDiscipline: vi.fn(),
  loadEmployeeIncidents: vi.fn(),
  loadEmployeeMeetings: vi.fn(),
  loadStayInterviews: vi.fn(),
  loadEmployeeReviews: vi.fn(),
  loadEmergencyContacts: vi.fn(),
  loadOnboardingTasks: vi.fn(),
  loadOffboardingTasks: vi.fn(),
  loadEmployeeLeaveRequests: vi.fn(),
  loadEmployeeDocuments: vi.fn(),
  loadEmployeeHistory: vi.fn(),
  initAccessibleDrawerTabs: vi.fn(),
  loadEmployeeCareSupport: vi.fn(),
  loadEmployeeManualAtRisk: vi.fn(),
  loadEmployeeManualImpactPlayer: vi.fn(),
  loadEmployeePayrollHandoffs: vi.fn(),
}));
vi.mock('../services/access', () => ({ canAccessPerformanceReviews: handlers.canAccessPerformanceReviews }));
vi.mock('../modules/lazyInternalJobBoard', () => ({ loadEmployeeInternalJobInterests: handlers.loadEmployeeInternalJobInterests }));
vi.mock('../modules/notes', () => ({ loadEmployeeNotes: handlers.loadEmployeeNotes }));
vi.mock('../modules/discipline', () => ({ loadEmployeeDiscipline: handlers.loadEmployeeDiscipline }));
vi.mock('../modules/incidents', () => ({ loadEmployeeIncidents: handlers.loadEmployeeIncidents }));
vi.mock('../modules/meetings', () => ({ loadEmployeeMeetings: handlers.loadEmployeeMeetings }));
vi.mock('../modules/stayInterviews', () => ({ loadStayInterviews: handlers.loadStayInterviews }));
vi.mock('../modules/reviews', () => ({ loadEmployeeReviews: handlers.loadEmployeeReviews }));
vi.mock('../modules/emergencyContacts', () => ({ loadEmergencyContacts: handlers.loadEmergencyContacts }));
vi.mock('../modules/onboarding', () => ({ loadOnboardingTasks: handlers.loadOnboardingTasks }));
vi.mock('../modules/offboarding', () => ({ loadOffboardingTasks: handlers.loadOffboardingTasks }));
vi.mock('../modules/leaveRequests', () => ({ loadEmployeeLeaveRequests: handlers.loadEmployeeLeaveRequests }));
vi.mock('../modules/employeeDocuments', () => ({ loadEmployeeDocuments: handlers.loadEmployeeDocuments }));
vi.mock('../ui/history', () => ({ loadEmployeeHistory: handlers.loadEmployeeHistory }));
vi.mock('../ui/drawerTabs', () => ({ initAccessibleDrawerTabs: handlers.initAccessibleDrawerTabs }));
vi.mock('../modules/employeeCareSupport', () => ({ loadEmployeeCareSupport: handlers.loadEmployeeCareSupport }));
vi.mock('../modules/employeeFlags', () => ({ loadEmployeeManualAtRisk: handlers.loadEmployeeManualAtRisk, loadEmployeeManualImpactPlayer: handlers.loadEmployeeManualImpactPlayer }));
vi.mock('../modules/payrollHandoff', () => ({ loadEmployeePayrollHandoffs: handlers.loadEmployeePayrollHandoffs }));
import { initializeEmployeeDrawerBindings } from './employeeDrawerBindings';
import { loadEmployeeDrawerTab } from '../modules/employeeDrawerTabLoads';

describe('employee drawer application wiring', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('window', { currentEmployee: { dbId: 'emp-1' } });
    vi.stubGlobal('document', { readyState: 'complete', addEventListener: vi.fn() });
    handlers.canAccessPerformanceReviews.mockReturnValue(true);
    initializeEmployeeDrawerBindings();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('registers compatibility adapters and initializes controls without fetching feature data', () => {
    expect(window.loadEmployeeDrawerTab).toBe(loadEmployeeDrawerTab);
    expect(handlers.initAccessibleDrawerTabs).toHaveBeenCalledTimes(1);
    expect(handlers.loadEmployeeNotes).not.toHaveBeenCalled();
    expect(handlers.loadEmployeeInternalJobInterests).not.toHaveBeenCalled();
  });

  it.each([
    ['profile', 'loadEmployeeInternalJobInterests'], ['notes', 'loadEmployeeNotes'],
    ['discipline', 'loadEmployeeDiscipline'], ['incidents', 'loadEmployeeIncidents'],
    ['meetings', 'loadEmployeeMeetings'], ['stay-interviews', 'loadStayInterviews'],
    ['reviews', 'loadEmployeeReviews'], ['emergency', 'loadEmergencyContacts'],
    ['onboarding', 'loadOnboardingTasks'], ['offboarding', 'loadOffboardingTasks'],
    ['time-off', 'loadEmployeeLeaveRequests'], ['documents', 'loadEmployeeDocuments'],
    ['history', 'loadEmployeeHistory'], ['care-support', 'loadEmployeeCareSupport'],
  ] as const)('connects %s to the correct exported loader', async (tab, handler) => {
    await loadEmployeeDrawerTab(tab);
    expect(handlers[handler]).toHaveBeenCalledWith('emp-1', expect.objectContaining({ employeeId: 'emp-1' }));
  });

  it('uses the canonical review access check rather than a replaceable window function', async () => {
    handlers.canAccessPerformanceReviews.mockReturnValue(false);
    window.canAccessPerformanceReviews = () => true;
    await loadEmployeeDrawerTab('reviews');
    expect(handlers.canAccessPerformanceReviews).toHaveBeenCalledWith(window.currentEmployee);
    expect(handlers.loadEmployeeReviews).not.toHaveBeenCalled();
  });

  it('awaits all employee-admin loaders', async () => {
    let finish!: () => void;
    handlers.loadEmployeeManualAtRisk.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    let complete = false;
    const request = loadEmployeeDrawerTab('employee').then(() => { complete = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(handlers.loadEmployeeManualAtRisk).toHaveBeenCalledWith('emp-1', expect.objectContaining({ tab: 'employee' }));
    expect(handlers.loadEmployeeManualImpactPlayer).toHaveBeenCalledWith('emp-1', expect.objectContaining({ tab: 'employee' }));
    expect(handlers.loadEmployeePayrollHandoffs).toHaveBeenCalledWith('emp-1', expect.objectContaining({ tab: 'employee' }));
    expect(complete).toBe(false);
    finish();
    await request;
    expect(complete).toBe(true);
  });
});
