

function openDrawer(employee) {
    if (!employee) return;

    currentEmployee = employee;

    const drawer = document.getElementById('employeeDrawer');
    if (!drawer) return;

    drawer.classList.remove('hidden');

    // Set header info
    if (typeof safeGet === 'function') {
        const nameEl = safeGet('drawerEmployeeName');
        const roleEl = safeGet('drawerEmployeeRole');

        if (nameEl) nameEl.textContent = employee.name || '';
        if (roleEl) roleEl.textContent = employee.role || '';
    }

    // Default to first tab
    switchDrawerTab('overview');
}

function closeDrawer() {
    const drawer = document.getElementById('employeeDrawer');
    if (!drawer) return;

    drawer.classList.add('hidden');
    currentEmployee = null;
}

function switchDrawerTab(tabName) {
    const tabs = document.querySelectorAll('.drawer-tab');
    const panels = document.querySelectorAll('.drawer-panel');

    tabs.forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    panels.forEach(panel => {
        if (panel.dataset.tab === tabName) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    });
}

function bindDrawerEvents() {
    document.querySelectorAll('[data-open-drawer]').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.getAttribute('data-open-drawer');
            const employee = EMPLOYEES.find(e =>
                String(e.dbId) === String(id) || String(e.id) === String(id)
            );

            if (employee) openDrawer(employee);
        });
    });

    const closeBtn = document.getElementById('drawerCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeDrawer);
    }

    document.querySelectorAll('.drawer-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchDrawerTab(tabName);
        });
    });
}

window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.switchDrawerTab = switchDrawerTab;
window.bindDrawerEvents = bindDrawerEvents;