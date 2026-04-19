import { supabase } from '../services/supabaseClient';

const urlParams = new URLSearchParams(window.location.search);

async function init(): Promise<void> {
    // If arriving from the email link, ?code= is present and the supabase client
    // auto-exchanges it for a temporary recovery session. Wait briefly for that.
    const arrivedFromEmail = urlParams.has('code');
    if (arrivedFromEmail) {
        await new Promise((r) => setTimeout(r, 400));
    }

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        showInvalidLink();
        return;
    }

    // Clean ?code= from URL so refreshing doesn't retry the exchange
    if (arrivedFromEmail) {
        window.history.replaceState({}, '', window.location.pathname);
    }

    showResetForm();
}

function showInvalidLink(): void {
    const root = document.getElementById('reset-root');
    if (!root) return;
    root.innerHTML = `
        <div style="
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 16px;
            padding: 40px 32px 32px;
            text-align: center;
        ">
            <img src="assets/landing/logos/remi-text-logo.png" alt="REMi" style="height: 40px; margin: 0 auto 28px; display: block;" />
            <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 8px; color: #e2e8f0;">Link expired</h2>
            <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px;">
                This password reset link is invalid or has expired.<br>Request a new one from the sign-in screen.
            </p>
            <a href="/index.html" style="
                display: inline-block; width: 100%; height: 48px; line-height: 48px;
                border-radius: 10px; background: #135bec; color: #fff;
                font-size: 15px; font-weight: 700; text-decoration: none;
            ">Back to sign in</a>
        </div>
    `;
}

function showResetForm(): void {
    const root = document.getElementById('reset-root');
    if (!root) return;

    root.innerHTML = `
        <div style="
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 16px;
            padding: 40px 32px 32px;
        ">
            <img src="assets/landing/logos/remi-text-logo.png" alt="REMi" style="height: 40px; margin: 0 auto 28px; display: block;" />
            <h2 style="text-align: center; font-size: 22px; font-weight: 700; margin-bottom: 4px;">Set a new password</h2>
            <p style="text-align: center; font-size: 14px; color: #94a3b8; margin-bottom: 24px;">Choose a strong password you'll remember.</p>

            <div id="reset-error" style="
                display: none;
                background: #451a1a;
                border: 1px solid #7f1d1d;
                color: #fca5a5;
                padding: 10px 14px;
                border-radius: 8px;
                font-size: 13px;
                margin-bottom: 16px;
                text-align: center;
            "></div>

            <form id="reset-form" style="display: flex; flex-direction: column; gap: 12px;">
                <div style="position: relative;">
                    <input id="new-password" type="password" placeholder="New password" required minlength="8" style="
                        width: 100%; height: 48px; padding: 0 44px 0 16px; border-radius: 10px;
                        border: 1px solid #475569; background: #0f172a; color: #fff;
                        font-size: 15px; font-family: 'Space Grotesk', sans-serif;
                        outline: none; transition: border-color 0.2s; box-sizing: border-box;
                    " onfocus="this.style.borderColor='#135bec'" onblur="this.style.borderColor='#475569'" />
                    <button id="new-password-toggle" type="button" aria-label="Show password" style="
                        position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
                        background: none; border: none; padding: 8px; cursor: pointer;
                        color: #94a3b8; display: flex; align-items: center; justify-content: center;
                        border-radius: 6px;
                    ">
                        <svg id="new-password-eye" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                </div>
                <input id="confirm-password" type="password" placeholder="Confirm new password" required minlength="8" style="
                    width: 100%; height: 48px; padding: 0 16px; border-radius: 10px;
                    border: 1px solid #475569; background: #0f172a; color: #fff;
                    font-size: 15px; font-family: 'Space Grotesk', sans-serif;
                    outline: none; transition: border-color 0.2s; box-sizing: border-box;
                " onfocus="this.style.borderColor='#135bec'" onblur="this.style.borderColor='#475569'" />
                <button id="reset-submit" type="submit" style="
                    width: 100%; height: 50px; border: none; border-radius: 10px;
                    background: #135bec; color: #fff; font-size: 15px; font-weight: 700;
                    font-family: 'Space Grotesk', sans-serif; cursor: pointer;
                    transition: background 0.2s; margin-top: 4px;
                " onmouseover="this.style.background='#0f4bc4'" onmouseout="this.style.background='#135bec'">
                    Update Password
                </button>
            </form>
        </div>
    `;

    wirePasswordToggle();
    document.getElementById('reset-form')!.addEventListener('submit', handleSubmit);
}

function wirePasswordToggle(): void {
    const EYE_OPEN = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    const EYE_OFF = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';

    const setVisible = (visible: boolean): void => {
        const input = document.getElementById('new-password') as HTMLInputElement | null;
        const eye = document.getElementById('new-password-eye');
        const btn = document.getElementById('new-password-toggle');
        if (!input || !eye || !btn) return;
        input.type = visible ? 'text' : 'password';
        btn.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
        eye.innerHTML = visible ? EYE_OFF : EYE_OPEN;
    };

    const toggleBtn = document.getElementById('new-password-toggle')!;
    let touchUsed = false;
    toggleBtn.addEventListener('touchstart', (e) => {
        touchUsed = true;
        e.preventDefault();
        const input = document.getElementById('new-password') as HTMLInputElement | null;
        setVisible(input?.type !== 'text');
    }, { passive: false });
    toggleBtn.addEventListener('mousedown', (e) => {
        if (touchUsed) return;
        e.preventDefault();
        setVisible(true);
    });
    const hideIfMouse = () => { if (!touchUsed) setVisible(false); };
    toggleBtn.addEventListener('mouseup', hideIfMouse);
    toggleBtn.addEventListener('mouseleave', hideIfMouse);
}

function showError(msg: string): void {
    const el = document.getElementById('reset-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
}

async function handleSubmit(e: Event): Promise<void> {
    e.preventDefault();
    const newPwd = (document.getElementById('new-password') as HTMLInputElement).value;
    const confirmPwd = (document.getElementById('confirm-password') as HTMLInputElement).value;
    const errEl = document.getElementById('reset-error');
    if (errEl) errEl.style.display = 'none';

    if (newPwd.length < 8) {
        showError('Password must be at least 8 characters.');
        return;
    }
    if (newPwd !== confirmPwd) {
        showError("Passwords don't match.");
        (document.getElementById('confirm-password') as HTMLElement).focus();
        return;
    }

    const submitBtn = document.getElementById('reset-submit') as HTMLButtonElement;
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.7';
    submitBtn.textContent = 'Updating...';

    const { error } = await supabase.auth.updateUser({ password: newPwd });

    if (error) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.textContent = 'Update Password';
        showError(error.message);
        return;
    }

    await showSuccess();
    // Sign out so the user logs in fresh with the new password
    await supabase.auth.signOut();
    window.location.href = '/index.html';
}

function wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

async function showSuccess(): Promise<void> {
    const root = document.getElementById('reset-root');
    if (!root) return;

    root.innerHTML = `
        <div id="success-card" style="
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 16px;
            padding: 40px 32px 32px;
            text-align: center;
            opacity: 0;
            transform: translateY(8px);
            transition: opacity 0.4s ease, transform 0.4s ease;
        ">
            <div id="success-badge" style="
                width: 64px; height: 64px; border-radius: 50%;
                background: #10b981; margin: 0 auto 20px;
                display: flex; align-items: center; justify-content: center;
                transform: scale(0);
                transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
            ">
                <svg viewBox="0 0 28 28" style="width: 32px; height: 32px;">
                    <path id="success-check" d="M6 14.5 L11.5 20 L22 9" fill="none" stroke="#fff" stroke-width="3"
                        stroke-linecap="round" stroke-linejoin="round"
                        style="stroke-dasharray: 30; stroke-dashoffset: 30;
                               transition: stroke-dashoffset 0.4s cubic-bezier(0.4, 0, 0.2, 1);" />
                </svg>
            </div>
            <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 8px; color: #e2e8f0;">Password updated</h2>
            <p style="font-size: 14px; color: #94a3b8;">Redirecting you to sign in...</p>
        </div>
    `;

    await wait(50);
    const card = document.getElementById('success-card');
    if (card) {
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
    }
    await wait(200);
    const badge = document.getElementById('success-badge');
    if (badge) badge.style.transform = 'scale(1)';
    await wait(300);
    const check = document.getElementById('success-check') as SVGPathElement | null;
    if (check) check.style.strokeDashoffset = '0';
    await wait(1200);
}

init();
