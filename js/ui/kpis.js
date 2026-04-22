

function setKpiValue(id, value) {
    const el = typeof safeGet === 'function' ? safeGet(id) : document.getElementById(id);
    if (el) {
        el.textContent = String(value ?? '');
    }
}

function setKpiSub(id, text) {
    const el = typeof safeGet === 'function' ? safeGet(id) : document.getElementById(id);
    if (el) {
        el.textContent = String(text ?? '');
    }
}

function setKpiCardFallback(cardSelector, value, subtext) {
    const valueEl = document.querySelector(`${cardSelector} .kpi-value`);
    const subEl = document.querySelector(`${cardSelector} .kpi-sub`);

    if (valueEl) {
        valueEl.textContent = String(value ?? '');
    }

    if (subEl) {
        subEl.textContent = String(subtext ?? '');
    }
}

function updateAtRiskKpi(count) {
    const total = Number(count || 0);
    const subtext = total === 0
        ? 'No employees currently flagged as at-risk'
        : `${total} employee${total === 1 ? '' : 's'} currently flagged as at-risk`;

    setKpiValue('kAtRiskEmployees', total);
    setKpiSub('kAtRiskEmployeesSub', subtext);
    setKpiCardFallback('#cardAtRiskEmployees', total, subtext);
}

function updateImpactPlayersKpi(count) {
    const total = Number(count || 0);
    const subtext = total === 0
        ? 'No employees currently flagged as high-impact contributors'
        : `${total} high-impact employee${total === 1 ? '' : 's'} based on reviews or recognition`;

    setKpiValue('kImpactPlayers', total);
    setKpiSub('kImpactPlayersSub', subtext);
    setKpiCardFallback('#cardImpactPlayers', total, subtext);
}

function updateReviewsDueKpi(count) {
    const total = Number(count || 0);
    const subtext = total === 0
        ? 'No reviews currently due'
        : `${total} review${total === 1 ? '' : 's'} due soon`;

    setKpiValue('kReviewsDue', total);
    setKpiSub('kReviewsDueSub', subtext);
    setKpiCardFallback('#cardReviewsDue', total, subtext);
}

function updateTurnoverRiskKpi(percentValue, subtext = '') {
    const value = percentValue === null || percentValue === undefined || percentValue === ''
        ? ''
        : percentValue;

    setKpiValue('kTurnoverRisk', value);
    if (subtext) {
        setKpiSub('kTurnoverRiskSub', subtext);
    }
    setKpiCardFallback('#cardTurnoverRisk', value, subtext || '');
}

window.setKpiValue = setKpiValue;
window.setKpiSub = setKpiSub;
window.setKpiCardFallback = setKpiCardFallback;
window.updateAtRiskKpi = updateAtRiskKpi;
window.updateImpactPlayersKpi = updateImpactPlayersKpi;
window.updateReviewsDueKpi = updateReviewsDueKpi;
window.updateTurnoverRiskKpi = updateTurnoverRiskKpi;