export type RosterRiskMeta = {
    manualReason?: string;
    lowReview?: boolean;
    reviewScore?: number | null;
    openIncidentCount?: number;
    flaggedDate?: string;
    flaggedBy?: string;
    [key: string]: any;
}; export type OrbisAppState = {
    atRiskMap: Record<string, RosterRiskMeta>;
    impactPlayerMap: Record<string, RosterRiskMeta>;
    currentEmergencyContactId: string | null;
}; export const OrbisState: OrbisAppState = {
    atRiskMap: {},
    impactPlayerMap: {},
    currentEmergencyContactId: null
};// Temporary global bridge while Orbis is moving from classic scripts to Vite modules.
// Existing JS modules can still read window.OrbisState until they are converted to imports.
(window as any).OrbisState = (window as any).OrbisState || OrbisState;
(window as any).OrbisState.atRiskMap = (window as any).OrbisState.atRiskMap || OrbisState.atRiskMap;
(window as any).OrbisState.impactPlayerMap = (window as any).OrbisState.impactPlayerMap || OrbisState.impactPlayerMap;
(window as any).OrbisState.currentEmergencyContactId = (window as any).OrbisState.currentEmergencyContactId || null;
