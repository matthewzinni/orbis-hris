// =========================
// GLOBAL APP STATE
// Temporary shared state during migration
// from legacy browser scripts to modules.
// =========================

export type RosterRiskMeta = {
    manualReason?: string;
    lowReview?: boolean;
    reviewScore?: number | null;
    openIncidentCount?: number;
    flaggedDate?: string;
    flaggedBy?: string;
    [key: string]: any;
};

export type OrbisAppState = {
    atRiskMap: Record<string, RosterRiskMeta>;
    impactPlayerMap: Record<string, RosterRiskMeta>;
    currentEmergencyContactId: string | null;
};

export const OrbisState: OrbisAppState = {
    atRiskMap: {},
    impactPlayerMap: {},
    currentEmergencyContactId: null
};

// =========================
// TEMP GLOBAL BRIDGE
// Allows legacy JS files to continue
// reading shared state during migration.
// =========================
(window as any).OrbisState = (window as any).OrbisState || OrbisState;

(window as any).OrbisState.atRiskMap =
    (window as any).OrbisState.atRiskMap || OrbisState.atRiskMap;

(window as any).OrbisState.impactPlayerMap =
    (window as any).OrbisState.impactPlayerMap || OrbisState.impactPlayerMap;

(window as any).OrbisState.currentEmergencyContactId =
    (window as any).OrbisState.currentEmergencyContactId || null;
