function getEmployeeRiskMeta(employee) {
    return currentAtRiskRosterMap[String(employee?.dbId)] ||
        currentAtRiskRosterMap[String(employee?.id)] ||
        null;
}

function getEmployeeImpactMeta(employee) {
    return currentImpactPlayerRosterMap[String(employee?.dbId)] ||
        currentImpactPlayerRosterMap[String(employee?.id)] ||
        null;
}

function buildRiskBadgeHtml(riskMeta) {
    if (!riskMeta) return '';

    const lines = ['At-Risk Flag'];

    if (riskMeta.manualReason) {
        lines.push('', `Reason: ${riskMeta.manualReason}`);
    }

    if (riskMeta.lowReview && riskMeta.reviewScore !== null && riskMeta.reviewScore !== undefined) {
        lines.push('', `Review Score: ${Number(riskMeta.reviewScore).toFixed(1)}`);
    }

    if (riskMeta.openIncidentCount > 0) {
        lines.push('', `Open Incidents: ${riskMeta.openIncidentCount}`);
    }

    if (riskMeta.flaggedDate) {
        const flaggedDateLabel = new Date(`${riskMeta.flaggedDate}T00:00:00`).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });

        lines.push('', `Flagged: ${flaggedDateLabel}`);
    }

    if (riskMeta.flaggedBy) {
        lines.push('', `By: ${riskMeta.flaggedBy}`);
    }

    return `<span class="badge badge-leave" style="background:#fef2f2; color:#991b1b; border:1px solid #fecaca; font-weight:700;" title="${esc(lines.join('\n'))}">At-Risk</span>`;
}

function buildImpactBadgeHtml(impactMeta) {
    if (!impactMeta) return '';

    const lines = ['Impact Player'];

    if (impactMeta.manualReason) {
        lines.push('', `Reason: ${impactMeta.manualReason}`);
    }

    if (impactMeta.highReview && impactMeta.reviewScore !== null && impactMeta.reviewScore !== undefined) {
        lines.push('', `Review Score: ${Number(impactMeta.reviewScore).toFixed(1)}`);
    }

    if (impactMeta.flaggedDate) {
        const flaggedDateLabel = new Date(`${impactMeta.flaggedDate}T00:00:00`).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });

        lines.push('', `Flagged: ${flaggedDateLabel}`);
    }

    if (impactMeta.flaggedBy) {
        lines.push('', `By: ${impactMeta.flaggedBy}`);
    }

    return `<span class="badge" style="background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; font-weight:700;" title="${esc(lines.join('\n'))}">Impact Player</span>`;
}

function updateEmployeeRowBadges() {
    const rows = document.querySelectorAll('#employeeTable tbody tr');

    rows.forEach(row => {
        const employeeId = row.getAttribute('data-employee-id');

        if (!employeeId) return;

        const employee = EMPLOYEES.find(e =>
            String(e.dbId) === String(employeeId) ||
            String(e.id) === String(employeeId)
        );

        if (!employee) return;

        let badgeContainer = row.querySelector('.employee-badges');

        if (!badgeContainer) {
            badgeContainer = document.createElement('div');
            badgeContainer.className = 'employee-badges';
            badgeContainer.style.display = 'flex';
            badgeContainer.style.flexDirection = 'column';
            badgeContainer.style.alignItems = 'flex-start';
            badgeContainer.style.gap = '4px';
            badgeContainer.style.marginTop = '6px';

            row.querySelector('td:nth-child(2)')?.appendChild(badgeContainer);
        }

        const riskMeta = getEmployeeRiskMeta(employee);
        const impactMeta = getEmployeeImpactMeta(employee);
        const riskHtml = buildRiskBadgeHtml(riskMeta);
        const impactHtml = buildImpactBadgeHtml(impactMeta);

        badgeContainer.innerHTML = `${impactHtml}${riskHtml}`;
        badgeContainer.style.display = 'flex';
        badgeContainer.style.flexDirection = 'column';
        badgeContainer.style.alignItems = 'flex-start';
        badgeContainer.style.gap = '4px';
        badgeContainer.style.marginTop = '6px';
    });
}

// =========================
// GLOBAL EXPORTS
// =========================
window.getEmployeeRiskMeta = getEmployeeRiskMeta;
window.getEmployeeImpactMeta = getEmployeeImpactMeta;
window.buildRiskBadgeHtml = buildRiskBadgeHtml;
window.buildImpactBadgeHtml = buildImpactBadgeHtml;
window.updateEmployeeRowBadges = updateEmployeeRowBadges;