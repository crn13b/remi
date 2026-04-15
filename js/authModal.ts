import { supabase } from '../services/supabaseClient';

type ModalMode = 'login' | 'signup';

let modal: HTMLDivElement | null = null;
let currentMode: ModalMode = 'login';

function isDarkMode(): boolean {
    return document.documentElement.classList.contains('dark');
}

function createModal(): HTMLDivElement {
    const backdrop = document.createElement('div');
    backdrop.id = 'auth-modal';
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.3s ease;';

    const dark = isDarkMode();

    backdrop.innerHTML = `
        <div id="auth-backdrop" style="position:absolute;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);"></div>
        <div id="auth-card" style="
            position:relative;
            width:100%;
            max-width:420px;
            margin:16px;
            background:${dark ? '#1e293b' : '#ffffff'};
            border-radius:16px;
            box-shadow:0 25px 50px -12px rgba(0,0,0,0.4);
            padding:40px 32px 32px;
            transform:scale(0.95);
            transition:transform 0.3s ease;
            font-family:'Space Grotesk',sans-serif;
            color:${dark ? '#ffffff' : '#0f172a'};
            border:1px solid ${dark ? '#334155' : '#e2e8f0'};
            max-height:calc(100vh - 32px);
            overflow-y:auto;
        ">
            <!-- Close Button -->
            <button id="auth-close" style="
                position:absolute;top:16px;right:16px;
                background:none;border:none;cursor:pointer;
                color:${dark ? '#94a3b8' : '#64748b'};
                font-size:20px;line-height:1;padding:4px;
                transition:color 0.2s;
            " onmouseover="this.style.color='${dark ? '#ffffff' : '#0f172a'}'" onmouseout="this.style.color='${dark ? '#94a3b8' : '#64748b'}'">&#10005;</button>

            <!-- Logo -->
            <div style="text-align:center;margin-bottom:24px;">
                <img src="assets/landing/logos/remi-text-logo.png" alt="REMi" style="height:40px;margin:0 auto;${dark ? '' : 'filter:invert(1);'}" />
            </div>

            <!-- Heading -->
            <h2 id="auth-heading" style="text-align:center;font-size:22px;font-weight:700;margin-bottom:4px;"></h2>
            <p id="auth-subheading" style="text-align:center;font-size:14px;color:${dark ? '#94a3b8' : '#64748b'};margin-bottom:24px;"></p>

            <!-- Error Message -->
            <div id="auth-error" style="
                display:none;
                background:${dark ? '#451a1a' : '#fef2f2'};
                border:1px solid ${dark ? '#7f1d1d' : '#fecaca'};
                color:${dark ? '#fca5a5' : '#dc2626'};
                padding:10px 14px;
                border-radius:8px;
                font-size:13px;
                margin-bottom:16px;
                text-align:center;
            "></div>

            <!-- Form -->
            <form id="auth-form" style="display:flex;flex-direction:column;gap:12px;">

                <!-- Signup-only fields -->
                <div id="auth-signup-fields" style="display:none;flex-direction:column;gap:12px;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                        <input id="auth-firstname" type="text" placeholder="First name" style="
                            width:100%;height:48px;padding:0 16px;border-radius:10px;
                            border:1px solid ${dark ? '#475569' : '#e2e8f0'};
                            background:${dark ? '#0f172a' : '#f8fafc'};
                            color:${dark ? '#ffffff' : '#0f172a'};
                            font-size:15px;font-family:'Space Grotesk',sans-serif;
                            outline:none;transition:border-color 0.2s;box-sizing:border-box;
                        " onfocus="this.style.borderColor='#135bec'" onblur="this.style.borderColor='${dark ? '#475569' : '#e2e8f0'}'" />
                        <input id="auth-lastname" type="text" placeholder="Last name" style="
                            width:100%;height:48px;padding:0 16px;border-radius:10px;
                            border:1px solid ${dark ? '#475569' : '#e2e8f0'};
                            background:${dark ? '#0f172a' : '#f8fafc'};
                            color:${dark ? '#ffffff' : '#0f172a'};
                            font-size:15px;font-family:'Space Grotesk',sans-serif;
                            outline:none;transition:border-color 0.2s;box-sizing:border-box;
                        " onfocus="this.style.borderColor='#135bec'" onblur="this.style.borderColor='${dark ? '#475569' : '#e2e8f0'}'" />
                    </div>
                    <div style="position:relative;">
                        <select id="auth-trades" style="
                            width:100%;height:48px;padding:0 16px;border-radius:10px;
                            border:1px solid ${dark ? '#475569' : '#e2e8f0'};
                            background:${dark ? '#0f172a' : '#f8fafc'};
                            color:${dark ? '#ffffff' : '#0f172a'};
                            font-size:15px;font-family:'Space Grotesk',sans-serif;
                            outline:none;transition:border-color 0.2s;box-sizing:border-box;
                            appearance:none;cursor:pointer;
                        " onfocus="this.style.borderColor='#135bec'" onblur="this.style.borderColor='${dark ? '#475569' : '#e2e8f0'}'">
                            <option value="" disabled selected>What do you trade?</option>
                            <option value="stocks">Stocks</option>
                            <option value="crypto">Crypto</option>
                            <option value="both">Both</option>
                        </select>
                        <span style="position:absolute;right:14px;top:50%;transform:translateY(-50%);pointer-events:none;color:${dark ? '#94a3b8' : '#64748b'};">▾</span>
                    </div>
                    <select id="auth-experience" style="
                        width:100%;height:48px;padding:0 16px;border-radius:10px;
                        border:1px solid ${dark ? '#475569' : '#e2e8f0'};
                        background:${dark ? '#0f172a' : '#f8fafc'};
                        color:${dark ? '#ffffff' : '#0f172a'};
                        font-size:15px;font-family:'Space Grotesk',sans-serif;
                        outline:none;transition:border-color 0.2s;box-sizing:border-box;
                        appearance:none;cursor:pointer;
                    " onfocus="this.style.borderColor='#135bec'" onblur="this.style.borderColor='${dark ? '#475569' : '#e2e8f0'}'">
                        <option value="" disabled selected>How experienced are you?</option>
                        <option value="beginner">Beginner — still learning the basics</option>
                        <option value="intermediate">Intermediate — trading for 1–3 years</option>
                        <option value="experienced">Experienced — 3+ years, comfortable with indicators</option>
                    </select>
                </div>

                <input id="auth-email" type="email" placeholder="Email address" required style="
                    width:100%;
                    height:48px;
                    padding:0 16px;
                    border-radius:10px;
                    border:1px solid ${dark ? '#475569' : '#e2e8f0'};
                    background:${dark ? '#0f172a' : '#f8fafc'};
                    color:${dark ? '#ffffff' : '#0f172a'};
                    font-size:15px;
                    font-family:'Space Grotesk',sans-serif;
                    outline:none;
                    transition:border-color 0.2s;
                    box-sizing:border-box;
                " onfocus="this.style.borderColor='#135bec'" onblur="this.style.borderColor='${dark ? '#475569' : '#e2e8f0'}'" />
                <input id="auth-password" type="password" placeholder="Password" required minlength="6" style="
                    width:100%;
                    height:48px;
                    padding:0 16px;
                    border-radius:10px;
                    border:1px solid ${dark ? '#475569' : '#e2e8f0'};
                    background:${dark ? '#0f172a' : '#f8fafc'};
                    color:${dark ? '#ffffff' : '#0f172a'};
                    font-size:15px;
                    font-family:'Space Grotesk',sans-serif;
                    outline:none;
                    transition:border-color 0.2s;
                    box-sizing:border-box;
                " onfocus="this.style.borderColor='#135bec'" onblur="this.style.borderColor='${dark ? '#475569' : '#e2e8f0'}'" />
                <button id="auth-submit" type="submit" style="
                    width:100%;
                    height:48px;
                    border:none;
                    border-radius:10px;
                    background:#135bec;
                    color:#ffffff;
                    font-size:15px;
                    font-weight:700;
                    font-family:'Space Grotesk',sans-serif;
                    cursor:pointer;
                    transition:background 0.2s;
                    margin-top:4px;
                " onmouseover="this.style.background='#0f4bc4'" onmouseout="this.style.background='#135bec'"></button>
            </form>

            <!-- Divider -->
            <div style="display:flex;align-items:center;gap:12px;margin:20px 0;">
                <div style="flex:1;height:1px;background:${dark ? '#334155' : '#e2e8f0'};"></div>
                <span style="font-size:12px;color:${dark ? '#64748b' : '#94a3b8'};font-weight:500;white-space:nowrap;">or continue with</span>
                <div style="flex:1;height:1px;background:${dark ? '#334155' : '#e2e8f0'};"></div>
            </div>

            <!-- Social Buttons -->
            <div style="display:flex;gap:12px;">
                <button id="auth-google" type="button" style="
                    flex:1;
                    height:48px;
                    border:1px solid ${dark ? '#475569' : '#e2e8f0'};
                    border-radius:10px;
                    background:${dark ? '#0f172a' : '#ffffff'};
                    color:${dark ? '#e2e8f0' : '#374151'};
                    font-size:14px;
                    font-weight:600;
                    font-family:'Space Grotesk',sans-serif;
                    cursor:pointer;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    gap:8px;
                    transition:background 0.2s,border-color 0.2s;
                " onmouseover="this.style.borderColor='#135bec'" onmouseout="this.style.borderColor='${dark ? '#475569' : '#e2e8f0'}'">
                    <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    Google
                </button>
            </div>

            <!-- Toggle Link -->
            <p id="auth-toggle" style="text-align:center;margin-top:20px;font-size:13px;color:${dark ? '#94a3b8' : '#64748b'};">
            </p>
        </div>
    `;

    document.body.appendChild(backdrop);

    // Animate in
    requestAnimationFrame(() => {
        backdrop.style.opacity = '1';
        const card = document.getElementById('auth-card');
        if (card) card.style.transform = 'scale(1)';
    });

    // Close handlers
    document.getElementById('auth-backdrop')!.addEventListener('click', closeModal);
    document.getElementById('auth-close')!.addEventListener('click', closeModal);

    // Form submission
    document.getElementById('auth-form')!.addEventListener('submit', handleSubmit);

    // Social buttons
    document.getElementById('auth-google')!.addEventListener('click', handleGoogle);

    // Toggle link
    document.getElementById('auth-toggle')!.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName === 'A') {
            e.preventDefault();
            currentMode = currentMode === 'login' ? 'signup' : 'login';
            updateModalContent();
        }
    });

    return backdrop;
}

function updateModalContent(): void {
    const heading = document.getElementById('auth-heading');
    const subheading = document.getElementById('auth-subheading');
    const submit = document.getElementById('auth-submit');
    const toggle = document.getElementById('auth-toggle');
    const error = document.getElementById('auth-error');

    if (!heading || !subheading || !submit || !toggle) return;

    // Clear errors on mode switch
    if (error) {
        error.style.display = 'none';
        error.textContent = '';
    }

    const linkColor = '#135bec';

    const signupFields = document.getElementById('auth-signup-fields');

    if (currentMode === 'login') {
        heading.textContent = 'Welcome back';
        subheading.textContent = 'Sign in to your REMi account';
        submit.textContent = 'Sign In';
        toggle.innerHTML = `Don't have an account? <a href="#" style="color:${linkColor};font-weight:600;text-decoration:none;">Sign up</a>`;
        if (signupFields) signupFields.style.display = 'none';
    } else {
        heading.textContent = 'Create your account';
        subheading.textContent = 'Start using REMi today';
        submit.textContent = 'Create Account';
        toggle.innerHTML = `Already have an account? <a href="#" style="color:${linkColor};font-weight:600;text-decoration:none;">Sign in</a>`;
        if (signupFields) signupFields.style.display = 'flex';
    }
}

function showEmailConfirmScreen(email: string): void {
    const card = document.getElementById('auth-card');
    if (!card) return;
    card.innerHTML = `
        <div style="text-align:center;padding:16px 0;">
            <div style="font-size:48px;margin-bottom:16px;">📬</div>
            <h2 style="font-size:22px;font-weight:700;margin-bottom:8px;">Check your email</h2>
            <p style="font-size:14px;color:#64748b;margin-bottom:8px;">We sent a confirmation link to:</p>
            <p id="auth-confirm-email" style="font-size:15px;font-weight:600;margin-bottom:24px;"></p>
            <p style="font-size:13px;color:#64748b;">Click the link in the email to confirm your account, then come back and sign in.</p>
            <button onclick="document.getElementById('auth-modal')?.remove()" style="
                margin-top:24px;
                width:100%;
                height:44px;
                border:none;
                border-radius:10px;
                background:#135bec;
                color:#fff;
                font-size:15px;
                font-weight:700;
                font-family:'Space Grotesk',sans-serif;
                cursor:pointer;
            ">Got it</button>
        </div>
    `;
    // Set email via textContent to prevent XSS
    const emailEl = document.getElementById('auth-confirm-email');
    if (emailEl) emailEl.textContent = email;
}

function showError(message: string): void {
    const error = document.getElementById('auth-error');
    if (error) {
        error.textContent = message;
        error.style.display = 'block';
    }
}

function setLoading(loading: boolean): void {
    const submit = document.getElementById('auth-submit') as HTMLButtonElement | null;
    if (submit) {
        submit.disabled = loading;
        submit.style.opacity = loading ? '0.7' : '1';
        submit.style.cursor = loading ? 'not-allowed' : 'pointer';
        if (loading) {
            submit.dataset.originalText = submit.textContent || '';
            submit.textContent = 'Please wait...';
        } else {
            submit.textContent = submit.dataset.originalText || submit.textContent;
        }
    }
    // Disable social buttons during loading
    const google = document.getElementById('auth-google') as HTMLButtonElement | null;
    if (google) google.disabled = loading;
}

async function handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    const email = (document.getElementById('auth-email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('auth-password') as HTMLInputElement).value;

    if (!email || !password) {
        showError('Please fill in all fields.');
        return;
    }
    if (password.length < 6) {
        showError('Password must be at least 6 characters.');
        return;
    }

    setLoading(true);
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.style.display = 'none';

    try {
        if (currentMode === 'login') {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                showError(error.message);
                setLoading(false);
                return;
            }
            const { data: { session } } = await supabase.auth.getSession();
            const dest = pendingStripeUrl
                ? pendingStripeUrl + '?client_reference_id=' + session?.user?.id
                : '/dashboard.html';
            window.location.href = dest;
        } else {
            const firstName = (document.getElementById('auth-firstname') as HTMLInputElement)?.value.trim() ?? '';
            const lastName = (document.getElementById('auth-lastname') as HTMLInputElement)?.value.trim() ?? '';
            const trades = (document.getElementById('auth-trades') as HTMLSelectElement)?.value ?? '';
            const experience = (document.getElementById('auth-experience') as HTMLSelectElement)?.value ?? '';

            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        first_name: firstName,
                        last_name: lastName,
                        trades,
                        experience_level: experience,
                        profile_complete: true,
                    }
                }
            });
            if (error) {
                showError(error.message);
                setLoading(false);
                return;
            }
            // Show email confirmation screen instead of auto-signing in
            showEmailConfirmScreen(email);
            return;
        }
    } catch (err) {
        showError('An unexpected error occurred. Please try again.');
        setLoading(false);
    }
}

async function handleGoogle(): Promise<void> {
    setLoading(true);
    const redirectTo = pendingStripeUrl
        ? window.location.origin + '/welcome.html?stripe_redirect=' + encodeURIComponent(pendingStripeUrl)
        : window.location.origin + '/welcome.html';
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo }
    });
    if (error) {
        showError(error.message);
        setLoading(false);
    }
}


function closeModal(): void {
    if (!modal) return;
    const card = document.getElementById('auth-card');
    if (card) card.style.transform = 'scale(0.95)';
    modal.style.opacity = '0';
    setTimeout(() => {
        modal?.remove();
        modal = null;
    }, 300);
}

function showModal(mode: ModalMode): void {
    if (modal) {
        modal.remove();
        modal = null;
    }
    currentMode = mode;
    modal = createModal();
    updateModalContent();
}

// Pending Stripe URL to redirect to after auth (used on pricing page)
let pendingStripeUrl: string | null = null;

// Attach listeners on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');

    loginBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        showModal('login');
    });

    signupBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        showModal('signup');
    });

    // Handle Google OAuth callback — if stripe_redirect param present, forward after auth
    const urlParams = new URLSearchParams(window.location.search);
    const stripeRedirect = urlParams.get('stripe_redirect');
    if (stripeRedirect) {
        // Validate redirect URL is same-origin to prevent open redirect attacks
        const isSafeRedirect = (url: string): boolean => {
            // Allow relative paths starting with /
            if (url.startsWith('/') && !url.startsWith('//')) {
                return true;
            }
            // Allow absolute URLs that match the current origin
            try {
                const parsed = new URL(url);
                return parsed.origin === window.location.origin;
            } catch {
                return false;
            }
        };

        const safeRedirect = isSafeRedirect(stripeRedirect) ? stripeRedirect : '/';

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                window.location.href = safeRedirect + '?client_reference_id=' + session.user.id;
            }
        });
    }

    // Intercept buy buttons on pricing page
    const buyButtons = document.querySelectorAll<HTMLAnchorElement>('a[href*="buy.stripe.com"]');
    buyButtons.forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const stripeUrl = btn.href;
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                // User is logged in — append their ID and go
                window.location.href = stripeUrl + '?client_reference_id=' + session.user.id;
            } else {
                // Not logged in — show signup modal, then redirect after auth
                pendingStripeUrl = stripeUrl;
                showModal('signup');
            }
        });
    });
});
