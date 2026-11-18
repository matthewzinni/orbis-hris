// Window globals still referenced by legacy HTML and migration bridges
export {};

window.currentAtRiskRosterMap = window.currentAtRiskRosterMap || {};
window.currentIronShiftRosterMap = window.currentIronShiftRosterMap || {};
window.currentManualAtRiskState = window.currentManualAtRiskState || {
  flagged: false,
  reason: '',
};
