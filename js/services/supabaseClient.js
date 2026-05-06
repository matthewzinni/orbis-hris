// =========================
// HISTORY MODULE
// =========================

function getResolvedHistoryEmployeeId(employeeId = null) {
    return currentEmployee?.dbId || currentEmployee?.id || employeeId;
}

async function loadEmployeeHistory(employeeId) {
    const actualEmployeeId = getResolvedHistoryEmployeeId(employeeId);

    const target = document.getElementById('historyFeed');

    if (!actualEmployeeId || !target) return;

    target.innerHTML = '<div class="empty">Loading history...</div>';

    const historyItems = [];

    try {
        historyItems.push({
            type: 'Notes',
            text: 'Notes history available in Notes tab.',
            date: ''
        });

        historyItems.push({
            type: 'Discipline',
            text: 'Discipline history available in Discipline tab.',
            date: ''
        });

        historyItems.push({
            type: 'Incidents',
            text: 'Incident history available in Incident Reports tab.',
            date: ''
        });

        historyItems.push({
            type: 'Reviews',
            text: 'Review history available in Reviews tab.',
            date: ''
        });

        target.innerHTML = historyItems.map(item => `
            <div class="history-item">
                <div class="history-top">
                    <div>
                        <div class="history-title">${esc(item.type)}</div>
                        <div class="history-date">${esc(item.date || 'Current record')}</div>
                    </div>
                </div>
                <div class="history-body">${esc(item.text)}</div>
            </div>
        `).join('');
    } catch (error) {
        console.error(error);
        target.innerHTML = '<div class="empty">Could not load employee history.</div>';
    }
}

// =========================
// GLOBAL EXPORTS
// =========================

window.getResolvedHistoryEmployeeId = getResolvedHistoryEmployeeId;
window.loadEmployeeHistory = loadEmployeeHistory;