// =========================
// EMPLOYEE FLAGS
// =========================

import type { Employee } from '../types/employeeTypes';

export interface EmployeeFlagResult {
    atRisk: boolean;
    disciplineRisk: boolean;
    reasons: string[];
}

export function evaluateEmployeeFlags(employee: Employee): EmployeeFlagResult {
    const reasons: string[] = [];

    const reviewScore = Number(employee.reviewScore || 0);
    const openIncidentCount = Number(employee.openIncidentCount || 0);

    const disciplineRisk = employee.flags?.disciplineRisk === true;

    const lowReviewRisk = reviewScore > 0 && reviewScore < 3;

    const incidentRisk = openIncidentCount > 0;

    const atRisk =
        disciplineRisk ||
        lowReviewRisk ||
        incidentRisk;

    if (disciplineRisk) {
        reasons.push('Discipline Risk');
    }

    if (lowReviewRisk) {
        reasons.push('Low Review Score');
    }

    if (incidentRisk) {
        reasons.push('Open Incident');
    }

    return {
        atRisk,
        disciplineRisk,
        reasons
    };
}