// Window globals still referenced by legacy HTML and migration bridges
export {};

window.currentAtRiskRosterMap = window.currentAtRiskRosterMap || {};
window.currentImpactPlayerRosterMap = window.currentImpactPlayerRosterMap || {};
window.currentIronShiftRosterMap = window.currentIronShiftRosterMap || {};
window.currentManualAtRiskState = window.currentManualAtRiskState || {
  flagged: false,
  reason: '',
};
window.currentManualImpactPlayerState = window.currentManualImpactPlayerState || {
  flagged: false,
  reason: '',
};
