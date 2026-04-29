// =========================
// EMPLOYEE HISTORY / ACTIVITY FEED
// =========================

function getResolvedHistoryEmployeeId(employeeId = null) {
    return currentEmployee?.dbId || currentEmployee?.id || employeeId;
}

async function loadEmployeeHistory(employeeId) {
    const actualEmployeeId = getResolvedHistoryEmployeeId(employeeId);
    const target = document.getElementById('historyFeed');

    if (!actualEmployeeId || !target) return;

    target.innerHTML = '<div class="empty">Loading history...</div>';

    const safeGetByEmployee = async (serviceName) => {
        try {
            const service = window.OrbisServices?.[serviceName];

            if (!service || typeof service.getByEmployee !== 'function') {
                console.info(`History service missing, skipped: ${serviceName}`);
                return { data: [] };
            }

            return await service.getByEmployee(actualEmployeeId);
        } catch (err) {
            console.warn(`History service failed: ${serviceName}`, err);
            return { data: [] };
        }
    };

    const sources = await Promise.all([
        safeGetByEmployee('notes'),
        safeGetByEmployee('meetings'),
        safeGetByEmployee('discipline'),
        safeGetByEmployee('incidents'),
        safeGetByEmployee('reviews')
    ]);

    const [notes, meetings, discipline, incidents, reviews] = sources.map(s => s?.data || []);

    const timeline = [
        ...notes.map(n => ({ type: 'Note', date: n.note_date, text: n.note_text })),
        ...meetings.map(m => ({ type: 'Meeting', date: m.meeting_date, text: m.subject || m.notes })),
        ...discipline.map(d => ({ type: 'Discipline', date: d.incident_date, text: d.description })),
        ...incidents.map(i => ({ type: 'Incident', date: i.incident_date, text: i.description })),
        ...reviews.map(r => ({ type: 'Review', date: r.review_date, text: r.overall_result }))
    ];

    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (!timeline.length) {
        target.innerHTML = '<div class="empty">No history available.</div>';
        return;
    }

    target.innerHTML = timeline.map(item => {
        const date = item.date ? new Date(item.date + 'T00:00:00').toLocaleDateString() : '—';

        return `
            <div class="card" style="margin-bottom:10px;">
                <strong>${item.type}</strong>
                <div style="font-size:12px; color:#64748b;">${date}</div>
                <div style="margin-top:4px;">${item.text || '—'}</div>
            </div>
        `;
    }).join('');
}

// =========================
// EXPORTS
// =========================

window.loadEmployeeHistory = loadEmployeeHistory;
window.getResolvedHistoryEmployeeId = getResolvedHistoryEmployeeId;