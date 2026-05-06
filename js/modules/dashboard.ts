// =========================
// DASHBOARD MODULE (SHELL)
// This file will host all dashboard loaders migrated out of app.ts
// =========================export async function loadSummaryMetrics(): Promise<void> {
if (typeof (window as any).loadSummaryMetrics === 'function') {
    await (window as any).loadSummaryMetrics();
}
}export async function loadReviewDashboard(): Promise<void> {
    if (typeof (window as any).loadReviewDashboard === 'function') {
        await (window as any).loadReviewDashboard();
    }
} export async function loadExecutiveInsight(): Promise<void> {
    if (typeof (window as any).loadExecutiveInsight === 'function') {
        await (window as any).loadExecutiveInsight();
    }
} export async function loadRiskEmployees(): Promise<void> {
    if (typeof (window as any).loadRiskEmployees === 'function') {
        await (window as any).loadRiskEmployees();
    }
} export async function loadImpactPlayers(): Promise<void> {
    if (typeof (window as any).loadImpactPlayers === 'function') {
        await (window as any).loadImpactPlayers();
    }
} export async function loadRecentActivity(): Promise<void> {
    if (typeof (window as any).loadRecentActivity === 'function') {
        await (window as any).loadRecentActivity();
    }
}