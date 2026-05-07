function getAuthClient() {

    return window.supabaseClient ||

        (typeof getOrbisSupabaseClient === 'function' ? getOrbisSupabaseClient() : null);

}

function showLoginView() {

    safeGet('authView')?.classList.remove('hidden');

    safeGet('appView')?.classList.add('hidden');

}

function showAppView(user) {

    safeGet('authView')?.classList.add('hidden');

    safeGet('appView')?.classList.remove('hidden');

    if (safeGet('currentUserEmail')) {

        safeGet('currentUserEmail').textContent = user?.email || 'Signed in';

    }

}

async function signIn() {

    const email = safeGet('loginEmail')?.value.trim().toLowerCase() || '';

    const password = safeGet('loginPassword')?.value || '';

    const btn = safeGet('loginBtn');

    if (!email || !password) {

        showToast('Enter your email and password.', 'error');

        return;

    }

    if (btn) {

        btn.disabled = true;

        btn.textContent = 'Signing In...';

    }

    try {

        const db = getAuthClient();

        const { data, error } = await db.auth.signInWithPassword({

            email,

            password

        });

        if (error) {

            console.error(error);

            showToast(error.message || 'Could not sign in.', 'error');

            return;

        }

        window.currentUser = data?.user || null;

        currentUser = window.currentUser;

        showAppView(window.currentUser);

        if (typeof loadAllDashboardData === 'function') {

            await loadAllDashboardData();

        } else if (typeof loadAppData === 'function') {

            await loadAppData();

        }

    } catch (err) {

        console.error(err);

        showToast('Something went wrong signing in.', 'error');

    } finally {

        if (btn) {

            btn.disabled = false;

            btn.textContent = 'Sign In';

        }

    }

}

async function signOut() {

    const db = getAuthClient();

    if (db) {

        await db.auth.signOut();

    }

    window.currentUser = null;

    currentUser = null;

    showLoginView();

}

window.signIn = signIn;

window.signOut = signOut;