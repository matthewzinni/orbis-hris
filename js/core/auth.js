// =========================
// CORE AUTH MODULE
// =========================function setLoginBusy(isBusy) {
const btn = safeGet('loginBtn');
if (!btn) return;
btn.disabled = isBusy;
btn.textContent = isBusy ? 'Signing In...' : 'Sign In';
}async function signIn() {
    const email = safeGet('loginEmail')?.value.trim().toLowerCase() || '';
    const password = safeGet('loginPassword')?.value || ''; if (!email || !password) {
        showToast('Enter your email and password.', 'error');
        return;
    } setLoginBusy(true); try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password }); if (error) {
            console.error(error);
            showToast('Invalid email or password, or this account is not authorized.', 'error');
            setAuthView(null);
            return;
        } if (!data?.session) {
            showToast('Sign-in failed. No active session was created.', 'error');
            setAuthView(null);
            return;
        } setAuthView(data.session);
        setText('currentUserEmail', data.session.user?.email || email);
        showToast('Signed in successfully.');
    } catch (err) {
        console.error(err);
        showToast('Something went wrong during sign-in.', 'error');
        setAuthView(null);
    } finally {
        setLoginBusy(false);
    }
} async function signOut() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            console.error(error);
            showToast('Could not log out.', 'error');
            return;
        } currentEmployee = null;
        EMPLOYEES = [];
        currentFilteredEmployees = []; if (typeof closeDrawer === 'function') {
            closeDrawer();
        } showToast('Logged out.');
        setAuthView(null);
    } catch (err) {
        console.error(err);
        showToast('Something went wrong during logout.', 'error');
    }
} async function initializeAuth() {
    try {
        const { data, error } = await supabaseClient.auth.getSession(); if (error) {
            console.error(error);
            showToast('Could not check session.', 'error');
            setAuthView(null);
            return;
        } setAuthView(data?.session || null); supabaseClient.auth.onAuthStateChange((_event, session) => {
            setAuthView(session || null);
        });
    } catch (err) {
        console.error(err);
        showToast('Could not initialize authentication.', 'error');
        setAuthView(null);
    }
} function setAuthView(session) {
    const authView = safeGet('authView');
    const appView = safeGet('appView'); if (!authView || !appView) return; if (session?.user) {
        authView.classList.add('hidden');
        appView.classList.remove('hidden');
        setText('currentUserEmail', session.user.email || 'Signed in'); currentUserRole = 'user';
        if (typeof applyRolePermissions === 'function') {
            applyRolePermissions();
        } if (typeof getUserRole === 'function') {
            getUserRole()
                .then(role => {
                    currentUserRole = role || 'user';
                    if (typeof applyRolePermissions === 'function') {
                        applyRolePermissions();
                    }
                })
                .catch(err => {
                    console.error(err);
                    currentUserRole = 'user';
                    if (typeof applyRolePermissions === 'function') {
                        applyRolePermissions();
                    }
                });
        } if (typeof loadAllDashboardData === 'function') {
            loadAllDashboardData();
        }
    } else {
        currentUserRole = 'user'; if (typeof applyRolePermissions === 'function') {
            applyRolePermissions();
        } appView.classList.add('hidden');
        authView.classList.remove('hidden');
        setText('currentUserEmail', '—'); if (safeGet('loginPassword')) {
            safeGet('loginPassword').value = '';
        }
    }
}// =========================
// EXPORTS
// =========================window.setLoginBusy = setLoginBusy;
window.signIn = signIn;
window.signOut = signOut;
window.initializeAuth = initializeAuth;
window.setAuthView = setAuthView;