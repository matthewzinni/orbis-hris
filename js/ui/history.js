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

    const [notes, meetings, discipline, incidents, reviews] = sources.map(source => source?.data || []);

    const timeline = [
        ...notes.map(note => ({
            type: 'Note',
            date: note.note_date,
            text: note.note_text
        })),
        ...meetings.map(meeting => ({
            type: 'Meeting',
            date: meeting.meeting_date,
            text: meeting.subject || meeting.notes
        })),
        ...discipline.map(record => ({
            type: 'Discipline',
            date: record.incident_date,
            text: record.description
        })),
        ...incidents.map(incident => ({
            type: 'Incident',
            date: incident.incident_date,
            text: incident.description
        })),
        ...reviews.map(review => ({
            type: 'Review',
            date: review.review_date,
            text: review.overall_result
        }))
    ];

    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (!timeline.length) {
        target.innerHTML = '<div class="empty">No history available.</div>';
        return;
    }

    target.innerHTML = timeline.map(item => {
        const date = item.date ? new Date(`${item.date}T00:00:00`).toLocaleDateString() : '—';

        return `
            <div class="card" style="margin-bottom:10px;">
                <strong>${esc(item.type)}</strong>
                <div style="font-size:12px; color:#64748b;">${date}</div>
                <div style="margin-top:4px;">${esc(item.text || '—')}</div>
            </div>
        `;
    }).join('');
}

// =========================
// EXPORTS
// =========================
window.loadEmployeeHistory = loadEmployeeHistory;
window.getResolvedHistoryEmployeeId = getResolvedHistoryEmployeeId;