function getResolvedReviewEmployeeId(employeeId = null) {
    return currentEmployee?.dbId || currentEmployee?.id || employeeId;

} async function reviewGetAll(employeeId) {
    const targetId = getResolvedReviewEmployeeId(employeeId);
    if (!targetId) return { data: [], error: null };
    if (typeof window.getEmployeeReviews === 'function') {
        return await window.getEmployeeReviews(targetId);
    }
    return await supabaseClient
        .from('employee_reviews')
        .select('*')
        .eq('employee_id', targetId)
        .order('review_date', { ascending: false });

} async function reviewCreate(payload) {
    if (!payload?.employee_id) return { data: null, error: new Error('Missing employee ID for review.') };
    if (typeof window.createEmployeeReview === 'function') {
        return await window.createEmployeeReview(payload);
    }
    return await supabaseClient
        .from('employee_reviews')
        .insert([payload]);

} async function reviewUpdate(reviewId, employeeId, payload) {
    const targetId = getResolvedReviewEmployeeId(employeeId);
    if (!reviewId || !targetId) return { data: null, error: new Error('Missing review ID or employee ID.') };
    if (typeof window.updateEmployeeReviewById === 'function') {
        return await window.updateEmployeeReviewById(reviewId, targetId, payload);
    }
    return await supabaseClient
        .from('employee_reviews')
        .update(payload)
        .eq('id', reviewId)
        .eq('employee_id', targetId);

} async function reviewDelete(reviewId) {
    if (!reviewId) return { data: null, error: new Error('Missing review ID.') };
    if (typeof window.deleteEmployeeReviewById === 'function') {
        return await window.deleteEmployeeReviewById(reviewId);
    }
    return await supabaseClient
        .from('employee_reviews')
        .delete()
        .eq('id', reviewId);

} function startReviewEdit(review) {
    resetDrawerForms(); currentReviewId = review.id; const scoreToLabel = (value) => {
        switch (Number(value)) {
            case 4:
                return 'Exceeds Expectations';
            case 3:
                return 'Meets Expectations';
            case 2:
                return 'Needs Improvement';
            case 1:
                return 'Unacceptable';
            default:
                return '';
        }
    };

    const extractValue = (label, text) => {
        if (!text) return '';
        const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = text.match(new RegExp(`${escapedLabel}:\\s*(.*)`));
        return match ? match[1].trim() : '';
    }; if (safeGet('reviewDate')) safeGet('reviewDate').value = review.review_date || todayInputValue();
    if (safeGet('reviewType')) safeGet('reviewType').value = review.review_type || '';
    if (safeGet('reviewQuality')) safeGet('reviewQuality').value = scoreToLabel(review.performance_score);
    if (safeGet('reviewAttendance')) safeGet('reviewAttendance').value = scoreToLabel(review.attendance_score);
    if (safeGet('reviewReliability')) safeGet('reviewReliability').value = scoreToLabel(review.reliability_score);

    const notes = review.manager_comments || '';

    if (safeGet('reviewCommunication')) safeGet('reviewCommunication').value = extractValue('Communication Skills', notes);
    if (safeGet('reviewJudgement')) safeGet('reviewJudgement').value = extractValue('Judgement & Decision-Making', notes);
    if (safeGet('reviewInitiative')) safeGet('reviewInitiative').value = extractValue('Initiative & Flexibility', notes);
    if (safeGet('reviewTeamwork')) safeGet('reviewTeamwork').value = scoreToLabel(review.teamwork_score);
    if (safeGet('reviewKnowledge')) safeGet('reviewKnowledge').value = extractValue('Knowledge of Position', notes);
    if (safeGet('reviewTraining')) safeGet('reviewTraining').value = extractValue('Training & Development', notes);
    if (safeGet('reviewOverallResult')) safeGet('reviewOverallResult').value = review.overall_result || '';
    if (safeGet('reviewStrengths')) safeGet('reviewStrengths').value = review.review_strengths || review.strengths || '';
    if (safeGet('reviewImprovements')) safeGet('reviewImprovements').value = review.review_improvements || review.improvements || '';
    if (safeGet('reviewEmployeeComments')) safeGet('reviewEmployeeComments').value = review.employee_comments || '';
    if (safeGet('reviewManagerComments')) safeGet('reviewManagerComments').value = review.manager_comments || ''; if (safeGet('saveReviewBtn')) safeGet('saveReviewBtn').textContent = 'Update Review'; switchTab('reviews');

} function cancelReviewEdit() {
    currentReviewId = null; if (safeGet('reviewDate')) safeGet('reviewDate').value = todayInputValue();
    if (safeGet('reviewType')) safeGet('reviewType').value = '';
    if (safeGet('reviewQuality')) safeGet('reviewQuality').value = '';
    if (safeGet('reviewAttendance')) safeGet('reviewAttendance').value = '';
    if (safeGet('reviewReliability')) safeGet('reviewReliability').value = '';
    if (safeGet('reviewCommunication')) safeGet('reviewCommunication').value = '';
    if (safeGet('reviewJudgement')) safeGet('reviewJudgement').value = '';
    if (safeGet('reviewInitiative')) safeGet('reviewInitiative').value = '';
    if (safeGet('reviewTeamwork')) safeGet('reviewTeamwork').value = '';
    if (safeGet('reviewKnowledge')) safeGet('reviewKnowledge').value = '';
    if (safeGet('reviewTraining')) safeGet('reviewTraining').value = '';
    if (safeGet('reviewOverallResult')) safeGet('reviewOverallResult').value = '';
    if (safeGet('reviewStrengths')) safeGet('reviewStrengths').value = '';
    if (safeGet('reviewImprovements')) safeGet('reviewImprovements').value = '';
    if (safeGet('reviewEmployeeComments')) safeGet('reviewEmployeeComments').value = '';
    if (safeGet('reviewManagerComments')) safeGet('reviewManagerComments').value = ''; if (safeGet('saveReviewBtn')) safeGet('saveReviewBtn').textContent = 'Save Review';
}

function buildReviewPayload() {
    const review_date = safeGet('reviewDate')?.value || '';
    const review_type = safeGet('reviewType')?.value || '';
    const reviewQuality = safeGet('reviewQuality')?.value || '';
    const reviewAttendance = safeGet('reviewAttendance')?.value || '';
    const reviewReliability = safeGet('reviewReliability')?.value || '';
    const reviewCommunication = safeGet('reviewCommunication')?.value || '';
    const reviewJudgement = safeGet('reviewJudgement')?.value || '';
    const reviewInitiative = safeGet('reviewInitiative')?.value || '';
    const reviewTeamwork = safeGet('reviewTeamwork')?.value || '';
    const reviewKnowledge = safeGet('reviewKnowledge')?.value || '';
    const reviewTraining = safeGet('reviewTraining')?.value || '';
    const overall_result = safeGet('reviewOverallResult')?.value || '';
    const strengths = safeGet('reviewStrengths')?.value || '';
    const improvements = safeGet('reviewImprovements')?.value || '';
    const employee_comments = safeGet('reviewEmployeeComments')?.value || '';
    const reviewManagerComments = safeGet('reviewManagerComments')?.value || '';

    const ratingToScore = (value) => {
        switch (String(value || '').trim()) {
            case 'Exceeds Expectations':
                return 4;
            case 'Meets Expectations':
                return 3;
            case 'Needs Improvement':
                return 2;
            case 'Unacceptable':
                return 1;
            default:
                return null;
        }
    };

    const communicationScore = ratingToScore(reviewCommunication);
    const judgementScore = ratingToScore(reviewJudgement);
    const initiativeScore = ratingToScore(reviewInitiative);
    const knowledgeScore = ratingToScore(reviewKnowledge);
    const trainingScore = ratingToScore(reviewTraining);

    const blendedAttitudeInputs = [
        communicationScore,
        judgementScore,
        initiativeScore,
        knowledgeScore,
        trainingScore
    ].filter(v => v !== null);

    const blendedAttitudeScore = blendedAttitudeInputs.length
        ? Math.round(blendedAttitudeInputs.reduce((sum, v) => sum + v, 0) / blendedAttitudeInputs.length)
        : null;

    const detailedCategorySummary = [
        `Quality of Work: ${reviewQuality || 'Not Rated'}`,
        `Attendance & Punctuality: ${reviewAttendance || 'Not Rated'}`,
        `Reliability / Dependability: ${reviewReliability || 'Not Rated'}`,
        `Communication Skills: ${reviewCommunication || 'Not Rated'}`,
        `Judgement & Decision-Making: ${reviewJudgement || 'Not Rated'}`,
        `Initiative & Flexibility: ${reviewInitiative || 'Not Rated'}`,
        `Cooperation & Teamwork: ${reviewTeamwork || 'Not Rated'}`,
        `Knowledge of Position: ${reviewKnowledge || 'Not Rated'}`,
        `Training & Development: ${reviewTraining || 'Not Rated'}`
    ].join('\n');

    return {
        review_date,
        review_type,
        payload: {
            review_date,
            review_type,
            attendance_score: ratingToScore(reviewAttendance),
            performance_score: ratingToScore(reviewQuality),
            teamwork_score: ratingToScore(reviewTeamwork),
            attitude_score: blendedAttitudeScore,
            reliability_score: ratingToScore(reviewReliability),
            overall_result,
            strengths,
            improvements,
            employee_comments,
            manager_comments: [reviewManagerComments, detailedCategorySummary].filter(Boolean).join('\n\n')
        }
    };
}

async function applyAutoImpactFlag(payload) {
    const employeeId = getResolvedReviewEmployeeId();

    if (!employeeId) {
        return { autoImpactKey: null, autoImpactMeta: null };
    }

    const avgScore = [
        payload.performance_score,
        payload.attendance_score,
        payload.teamwork_score,
        payload.attitude_score,
        payload.reliability_score
    ].filter(v => v !== null);

    const average = avgScore.length
        ? avgScore.reduce((a, b) => a + b, 0) / avgScore.length
        : null;

    const autoImpactKey = String(employeeId);
    const alreadyImpact = currentImpactPlayerRosterMap?.[autoImpactKey]?.highReview === true;
    const autoImpactMeta = average !== null && average >= 3.5
        ? {
            ...(currentImpactPlayerRosterMap?.[autoImpactKey] || {}),
            manualReason: (currentImpactPlayerRosterMap?.[autoImpactKey] || {}).manualReason || 'Auto-flagged from high performance review',
            flaggedDate: todayInputValue(),
            flaggedBy: (currentImpactPlayerRosterMap?.[autoImpactKey] || {}).flaggedBy || 'System',
            highReview: true,
            reviewScore: average
        }
        : null;

    if (autoImpactMeta) {
        currentImpactPlayerRosterMap = currentImpactPlayerRosterMap || {};
        currentImpactPlayerRosterMap[autoImpactKey] = autoImpactMeta;

        if (!alreadyImpact) {
            showToast('✨ Just Promoted to Impact Player', 'success');
            window.__justPromotedImpactPlayerId = autoImpactKey;
            window.__justPromotedImpactPlayerUntil = Date.now() + 6000;
        }

        if (typeof renderRoster === 'function') {
            renderRoster();
        }

        if (typeof buildKpiHoverDetails === 'function') {
            buildKpiHoverDetails();
        }

        try {
            if (!currentImpactPlayerRosterMap?.[autoImpactKey]?.persisted) {
                const existingAutoImpact = await supabaseClient
                    .from('employee_notes')
                    .select('id')
                    .eq('employee_id', employeeId)
                    .eq('note_type', 'Impact Player Flag')
                    .eq('note_text', 'Auto-flagged from high performance review')
                    .limit(1);

                if (!existingAutoImpact.error && !(existingAutoImpact.data || []).length) {
                    await supabaseClient
                        .from('employee_notes')
                        .insert([{
                            employee_id: employeeId,
                            note_type: 'Impact Player Flag',
                            note_text: 'Auto-flagged from high performance review',
                            note_date: todayInputValue()
                        }]);
                }

                currentImpactPlayerRosterMap[autoImpactKey].persisted = true;
            }
        } catch (err) {
            console.error('Auto Impact Player flag failed:', err);
        }
    }

    return { autoImpactKey, autoImpactMeta };
} async function refreshReviewUi(autoImpactKey, autoImpactMeta) {

    const employeeId = getResolvedReviewEmployeeId();

    if (!employeeId) return;

    cancelReviewEdit();

    await loadEmployeeReviews(employeeId);

    if (typeof loadSummaryMetrics === 'function') await loadSummaryMetrics();

    if (typeof loadRiskEmployees === 'function') await loadRiskEmployees();

    if (typeof loadImpactPlayers === 'function') await loadImpactPlayers();

    if (autoImpactMeta) {

        currentImpactPlayerRosterMap = currentImpactPlayerRosterMap || {};

        currentImpactPlayerRosterMap[autoImpactKey] = {

            ...(currentImpactPlayerRosterMap[autoImpactKey] || {}),

            ...autoImpactMeta

        };

    }

    if (typeof loadEmployees === 'function') {

        await loadEmployees();

    }

    if (currentEmployee && typeof openDrawer === 'function') {

        const refreshedEmployee = EMPLOYEES.find(e =>

            String(e.dbId) === String(currentEmployee.dbId) ||

            String(e.id) === String(currentEmployee.id)

        );

        if (refreshedEmployee) {

            openDrawer(refreshedEmployee);

            switchTab('reviews');

        }

    }

    if (typeof renderRoster === 'function') {

        renderRoster();

    }

    if (window.__justPromotedImpactPlayerId && window.__justPromotedImpactPlayerUntil > Date.now()) {

        const applyGlow = () => {

            const rosterCards = Array.from(document.querySelectorAll('[data-id], [data-employee-id], .employee-row, .roster-row, .person-row'));

            rosterCards.forEach(el => {

                const elId = String(el.dataset.id || el.dataset.employeeId || '');

                if (elId && elId === String(window.__justPromotedImpactPlayerId)) {

                    el.classList.add('impact-player-glow');

                    setTimeout(() => el.classList.remove('impact-player-glow'), 6000);

                }

            });

        };

        applyGlow();

        setTimeout(applyGlow, 250);

        setTimeout(applyGlow, 800);

    }

    if (typeof loadRecentActivity === 'function') await loadRecentActivity();

    if (typeof loadReviewDashboard === 'function') await loadReviewDashboard();

    if (typeof buildKpiHoverDetails === 'function') buildKpiHoverDetails();

} async function saveEmployeeReview() {

    if (!currentEmployee) return;

    const employeeId = getResolvedReviewEmployeeId();

    if (!employeeId) {

        showToast('No employee selected.', 'error');

        return;

    }

    const { review_date, payload } = buildReviewPayload();

    if (!review_date) {

        showToast('Enter a review date.', 'error');

        return;

    }

    let error;

    if (currentReviewId) {

        const result = await reviewUpdate(currentReviewId, employeeId, payload);

        error = result.error;

    } else {

        const result = await reviewCreate({

            employee_id: employeeId,

            created_at: new Date().toISOString(),

            ...payload

        });

        error = result.error;

    }

    if (error) {

        console.error(error);

        showToast(`Could not save review: ${error.message || 'Unknown error'}`, 'error');

        return;

    }

    showToast(currentReviewId ? 'Review updated.' : 'Review saved.');

    const { autoImpactKey, autoImpactMeta } = await applyAutoImpactFlag(payload);

    await refreshReviewUi(autoImpactKey, autoImpactMeta);

}

async function deleteEmployeeReview(reviewId) {

    const employeeId = getResolvedReviewEmployeeId();

    if (!employeeId) {

        showToast('No employee selected.', 'error');

        return;

    }

    if (!confirm('Delete this review?')) return;

    const { error } = await reviewDelete(reviewId);

    if (error) {

        console.error(error);

        showToast('Could not delete review.', 'error');

        return;

    }

    if (String(currentReviewId) === String(reviewId)) {

        cancelReviewEdit();

    }

    const remainingReviewsResult = await reviewGetAll(employeeId);

    const remainingReviews = remainingReviewsResult?.data || [];

    const stillQualifiesForAutoImpact = remainingReviews.some(row => {

        const scores = [

            row.attendance_score,

            row.performance_score,

            row.teamwork_score,

            row.attitude_score,

            row.reliability_score

        ].map(v => Number(v)).filter(v => !isNaN(v));

        const avg = scores.length

            ? scores.reduce((sum, v) => sum + v, 0) / scores.length

            : null;

        return avg !== null && avg >= 3.5;

    });

    const impactKey = String(employeeId);

    if (!stillQualifiesForAutoImpact) {

        await supabaseClient

            .from('employee_notes')

            .delete()

            .eq('employee_id', employeeId)

            .eq('note_type', 'Impact Player Flag')

            .eq('note_text', 'Auto-flagged from high performance review');

        if (currentImpactPlayerRosterMap && currentImpactPlayerRosterMap[impactKey]) {

            const existing = currentImpactPlayerRosterMap[impactKey];

            const isOnlyAutoFlag = !existing.manualReason || existing.manualReason === 'Auto-flagged from high performance review';

            if (isOnlyAutoFlag) {

                delete currentImpactPlayerRosterMap[impactKey];

            } else {

                currentImpactPlayerRosterMap[impactKey] = {

                    ...existing,

                    highReview: false,

                    reviewScore: null,

                    persisted: false

                };

            }

        }

    } else if (currentImpactPlayerRosterMap && currentImpactPlayerRosterMap[impactKey]) {

        currentImpactPlayerRosterMap[impactKey] = {

            ...currentImpactPlayerRosterMap[impactKey],

            highReview: true,

            persisted: true

        };

    }

    showToast('Review deleted.');

    await loadEmployeeReviews(employeeId);

    switchTab('reviews');

    if (typeof loadSummaryMetrics === 'function') await loadSummaryMetrics();

    if (typeof loadImpactPlayers === 'function') await loadImpactPlayers();

    if (typeof loadEmployees === 'function') {

        await loadEmployees();

    } else if (typeof renderRoster === 'function') {

        renderRoster();

    }

    if (typeof loadRecentActivity === 'function') await loadRecentActivity();

    if (typeof loadReviewDashboard === 'function') await loadReviewDashboard();

    if (typeof buildKpiHoverDetails === 'function') buildKpiHoverDetails();


}

async function loadEmployeeReviews(employeeId) {
    const actualEmployeeId = getResolvedReviewEmployeeId(employeeId);

    if (!actualEmployeeId) return;

    const target = safeGet('reviewsHistory');

    if (!target) return;

    const { data, error } = await reviewGetAll(actualEmployeeId);

    if (error) {
        console.error(error);
        target.innerHTML = '<div class="empty">Could not load reviews</div>';
        return;
    }

    if (!data || !data.length) {
        target.innerHTML = '<div class="empty">No reviews yet</div>';
        return;
    }

    target.innerHTML = data.map((row, index) => {
        const currentScores = [
            row.attendance_score,
            row.performance_score,
            row.teamwork_score,
            row.attitude_score,
            row.reliability_score
        ].map(v => Number(v)).filter(v => !isNaN(v));

        const currentAvg = currentScores.length
            ? currentScores.reduce((sum, v) => sum + v, 0) / currentScores.length
            : null;

        const previousRow = data[index + 1] || null;
        const previousScores = previousRow ? [
            previousRow.attendance_score,
            previousRow.performance_score,
            previousRow.teamwork_score,
            previousRow.attitude_score,
            previousRow.reliability_score
        ].map(v => Number(v)).filter(v => !isNaN(v)) : [];

        const previousAvg = previousScores.length
            ? previousScores.reduce((sum, v) => sum + v, 0) / previousScores.length
            : null;

        let trendBadge = '';
        let trendLine = '';

        if (currentAvg !== null && previousAvg !== null) {
            const diff = currentAvg - previousAvg;

            if (diff >= 0.35) {
                trendBadge = '<span class="badge badge-active">↑ Improving</span>';
                trendLine = `Improving from ${previousAvg.toFixed(1)} to ${currentAvg.toFixed(1)}`;
            } else if (diff <= -0.35) {
                trendBadge = '<span class="badge badge-inactive">↓ Declining</span>';
                trendLine = `Declining from ${previousAvg.toFixed(1)} to ${currentAvg.toFixed(1)}`;
            } else {
                trendBadge = '<span class="badge badge-soft">→ Stable</span>';
                trendLine = `Stable around ${currentAvg.toFixed(1)}`;
            }
        }

        const tenureMonths = Number(currentEmployee?.tenureMonths || currentEmployee?.tenure_months || 0);
        const promotionSignal = currentAvg !== null && currentAvg >= 3.5 && tenureMonths > 3;

        return `
        <div class="history-item">
          <div class="history-top">
            <div>
              <div class="history-title">${esc(row.review_type || 'Review')}</div>
              <div class="history-date">${esc(row.review_date || '')}</div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <button class="button soft" type="button" data-edit-review-id="${esc(row.id)}">Edit</button>
              <button class="button danger" type="button" data-delete-review-id="${esc(row.id)}">Delete</button>
              <span class="badge badge-soft">Review</span>
              ${(() => {
                if (currentAvg !== null && currentAvg >= 3.5) {
                    return '<span class="badge badge-active">Impact Signal</span>';
                }

                if (currentAvg !== null && currentAvg <= 2.5) {
                    return '<span class="badge badge-inactive">At-Risk Signal</span>';
                }

                return '';
            })()}
              ${promotionSignal ? '<span class="badge badge-soft">Promotion Signal</span>' : ''}
              ${trendBadge}
            </div>
          </div>
          <div class="history-body">
            <strong>Attendance:</strong> ${esc(row.attendance_score || row.attendance || '')}<br>
            <strong>Quality of Work:</strong> ${esc(row.performance_score || row.performance || '')}<br>
            <strong>Cooperation & Teamwork:</strong> ${esc(row.teamwork_score || row.teamwork || '')}<br>
            ${(() => {
                const score = Number(row.attitude_score || row.attitude || '');
                let label = '';

                if (score === 4) label = 'Elite';
                else if (score === 3) label = 'Strong';
                else if (score === 2) label = 'Developing';
                else if (score === 1) label = 'At Risk';

                return `<strong>Blended Professional Score:</strong> ${esc(row.attitude_score || row.attitude || '')}${label ? ` (${esc(label)})` : ''}<br>`;
            })()}
            <strong>Reliability:</strong> ${esc(row.reliability_score || row.reliability || '')}<br>
            ${(() => {
                if (currentAvg === null) {
                    return `<strong>Review Signal:</strong> Not enough scored data<br>`;
                }

                if (currentAvg >= 3.5) {
                    return `<strong>Review Signal:</strong> Impact Player range (${esc(currentAvg.toFixed(1))})<br>`;
                }

                if (currentAvg <= 2.5) {
                    return `<strong>Review Signal:</strong> At-Risk range (${esc(currentAvg.toFixed(1))})<br>`;
                }

                return `<strong>Review Signal:</strong> Neutral / developing range (${esc(currentAvg.toFixed(1))})<br>`;
            })()}
            ${promotionSignal ? `<strong>Promotion Signal:</strong> Strong recent review and tenure over 90 days<br>` : ''}
            ${trendLine ? `<strong>Trend:</strong> ${esc(trendLine)}<br>` : ''}
            <strong>Overall Result:</strong> ${esc(row.overall_result || '')}<br><br>
            <strong>Strongest Contributions:</strong><br>${nl2br(row.review_strengths || row.strengths || '')}<br><br>
            <strong>Areas for Improvement:</strong><br>${nl2br(row.review_improvements || row.improvements || '')}<br><br>
            <strong>Employee Comments:</strong><br>${nl2br(row.employee_comments || '')}<br><br>
            <strong>Manager Action Plan:</strong><br>${nl2br(row.manager_comments || '')}
          </div>
        </div>
    `;
    }).join('');

    target.querySelectorAll('[data-edit-review-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const review = data.find(row => String(row.id) === String(btn.dataset.editReviewId));
            if (review) startReviewEdit(review);
        });
    });

    target.querySelectorAll('[data-delete-review-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            deleteEmployeeReview(btn.dataset.deleteReviewId);
        });
    });
}

if (!document.getElementById('impact-player-glow-style')) {
    const style = document.createElement('style');
    style.id = 'impact-player-glow-style';
    style.textContent = `
        .impact-player-glow {
            position: relative;
            animation: impactPlayerGlowPulse 1.5s ease-in-out 4;
            box-shadow: 0 0 0 2px rgba(31, 157, 109, 0.24), 0 0 22px rgba(31, 157, 109, 0.28);
            border-radius: 16px;
        }

        @keyframes impactPlayerGlowPulse {
            0% {
                box-shadow: 0 0 0 0 rgba(31, 157, 109, 0.00), 0 0 0 rgba(31, 157, 109, 0.00);
                transform: translateY(0);
            }
            35% {
                box-shadow: 0 0 0 2px rgba(31, 157, 109, 0.22), 0 0 20px rgba(31, 157, 109, 0.22);
                transform: translateY(-1px);
            }
            70% {
                box-shadow: 0 0 0 3px rgba(31, 157, 109, 0.14), 0 0 12px rgba(31, 157, 109, 0.16);
                transform: translateY(0);
            }
            100% {
                box-shadow: 0 0 0 0 rgba(31, 157, 109, 0.00), 0 0 0 rgba(31, 157, 109, 0.00);
                transform: translateY(0);
            }
        }
    `;

    document.head.appendChild(style);
}

// =========================
// GLOBAL EXPORTS
// =========================
window.getResolvedReviewEmployeeId = getResolvedReviewEmployeeId;
window.startReviewEdit = startReviewEdit;
window.cancelReviewEdit = cancelReviewEdit;
window.loadEmployeeReviews = loadEmployeeReviews;
window.saveEmployeeReview = saveEmployeeReview;
window.deleteEmployeeReview = deleteEmployeeReview;
window.saveReviewRecord = saveEmployeeReview;
window.deleteReviewRecord = deleteEmployeeReview;