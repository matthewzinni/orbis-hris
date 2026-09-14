import { configureDerivedUiRefresh } from '../services/derivedDataRefresh';
import { loadAttentionSummary } from '../services/attention/attentionSummary';
import { loadHrInbox } from '../ui/hrInbox';
import { loadAttentionWorkspaceUi } from '../ui/attentionWorkspace';
import { loadSummaryMetrics, renderBasicDashboardKpis } from '../ui/kpis';
import { loadManagerHome } from '../modules/managerHome';

/** The application owns wiring; domain services never reach into window for it. */
export function initializeDerivedRefreshBindings(): void {
  configureDerivedUiRefresh({
    summary: loadSummaryMetrics,
    inbox: loadHrInbox,
    attentionSummary: loadAttentionSummary,
    attentionWorkspace: loadAttentionWorkspaceUi,
    managerHome: loadManagerHome,
    basicKpis: renderBasicDashboardKpis,
  });
}
