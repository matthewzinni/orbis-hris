// =========================
// DASHBOARD MODULE
// Dashboard loaders migrated from legacy app.ts
// =========================

import {
  getEmployees,
  getActiveEmployees,
  getInactiveEmployees,
  getTerminatedEmployees,
  getEmployeesOnLeave,
} from './employees';

export interface DashboardMetrics {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  terminatedEmployees: number;
  employeesOnLeave: number;
}

export function getDashboardMetrics(): DashboardMetrics {
  return {
    totalEmployees: getEmployees().length,
    activeEmployees: getActiveEmployees().length,
    inactiveEmployees: getInactiveEmployees().length,
    terminatedEmployees: getTerminatedEmployees().length,
    employeesOnLeave: getEmployeesOnLeave().length,
  };
}

export async function loadSummaryMetrics(): Promise<void> {
  if (typeof window.loadSummaryMetrics === 'function') {
    await window.loadSummaryMetrics();
  }
}

export async function loadReviewDashboard(): Promise<void> {
  if (typeof (window as any).loadReviewDashboard === 'function') {
    await (window as any).loadReviewDashboard();
  }
}

export async function loadExecutiveInsight(): Promise<void> {
  if (typeof (window as any).loadExecutiveInsight === 'function') {
    await (window as any).loadExecutiveInsight();
  }
}

export async function loadRiskEmployees(): Promise<void> {
  if (typeof (window as any).loadRiskEmployees === 'function') {
    await (window as any).loadRiskEmployees();
  }
}

export async function loadImpactPlayers(): Promise<void> {
  if (typeof (window as any).loadImpactPlayers === 'function') {
    await (window as any).loadImpactPlayers();
  }
}

export async function loadRecentActivity(): Promise<void> {
  if (typeof window.loadManagerHome === 'function') {
    await window.loadManagerHome(true);
  }

  if (typeof window.loadDashboardOverview === 'function') {
    await window.loadDashboardOverview();
    return;
  }

  if (typeof window.loadAllDashboardData === 'function') {
    await window.loadAllDashboardData();
  }
}

window.loadRecentActivity = loadRecentActivity;