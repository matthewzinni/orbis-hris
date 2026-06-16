// Window globals still referenced by legacy HTML and migration bridges
export {};

declare global {
  interface Window {
    hrIntelligenceContext?: import('../services/hrIntelligence').HrIntelligenceContext;
    currentAtRiskRosterMap?: Record<string, unknown>;
    currentImpactPlayerRosterMap?: Record<string, unknown>;
    currentManualAtRiskState?: { flagged: boolean; reason: string };
    currentManualImpactPlayerState?: { flagged: boolean; reason: string };
  }
}

window.currentAtRiskRosterMap = window.currentAtRiskRosterMap || {};
window.currentImpactPlayerRosterMap = window.currentImpactPlayerRosterMap || {};
window.currentManualAtRiskState = window.currentManualAtRiskState || {
  flagged: false,
  reason: '',
};
window.currentManualImpactPlayerState = window.currentManualImpactPlayerState || {
  flagged: false,
  reason: '',
};
