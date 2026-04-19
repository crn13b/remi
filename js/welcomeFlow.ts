import { supabase } from '../services/supabaseClient';

// Read stripe_redirect from URL if present (passed from pricing page flow)
const urlParams = new URLSearchParams(window.location.search);
const stripeRedirect = urlParams.get('stripe_redirect');

function getDestination(userId: string): string {
    if (stripeRedirect) {
        // Validate same-origin
        if (stripeRedirect.startsWith('/') && !stripeRedirect.startsWith('//')) {
            const sep = stripeRedirect.includes('?') ? '&' : '?';
            return stripeRedirect + sep + 'client_reference_id=' + userId;
        }
        try {
            const parsed = new URL(stripeRedirect);
            if (parsed.origin === window.location.origin) {
                const sep = stripeRedirect.includes('?') ? '&' : '?';
                return stripeRedirect + sep + 'client_reference_id=' + userId;
            }
        } catch { /* invalid URL, fall through */ }
    }
    return '/dashboard.html';
}

async function init(): Promise<void> {
    // If arriving from an email confirmation link, Supabase's detectSessionInUrl
    // auto-exchanges the ?code= param. We detect it up front to show a "confirmed!"
    // beat before the welcome/profile flow.
    const justConfirmed = urlParams.has('code');

    // If we arrived with a ?code=, wait briefly for the PKCE exchange to settle
    // so getUser() sees the new session on the first try.
    if (justConfirmed) {
        await new Promise((r) => setTimeout(r, 400));
    }

    const { data: { user }, error } = await supabase.auth.getUser();

    // No session — send to landing page
    if (error || !user) {
        window.location.href = '/index.html';
        return;
    }

    // Clean the ?code= out of the URL so refreshing doesn't retry the exchange
    if (justConfirmed) {
        const cleanUrl = window.location.pathname + (stripeRedirect ? '?stripe_redirect=' + encodeURIComponent(stripeRedirect) : '');
        window.history.replaceState({}, '', cleanUrl);
    }

    const meta = user.user_metadata ?? {};

    // Profile already complete — skip to dashboard (still show confirm beat if just confirmed)
    if (meta.profile_complete === true) {
        if (justConfirmed) {
            await showConfirmedMoment();
        }
        window.location.href = getDestination(user.id);
        return;
    }

    // New user — show confirmation success first, then welcome flow
    if (justConfirmed) {
        await showConfirmedMoment();
    }
    showWelcomeScreen(user.id);
}

async function showConfirmedMoment(): Promise<void> {
    const root = document.getElementById('welcome-root');
    if (!root) return;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 16px;
        padding: 40px 32px 32px;
        text-align: center;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 0.4s ease, transform 0.4s ease;
    `;

    wrapper.innerHTML = `
        <div style="
            width: 64px; height: 64px; border-radius: 50%;
            background: #10b981; margin: 0 auto 20px;
            display: flex; align-items: center; justify-content: center;
        ">
            <svg viewBox="0 0 28 28" style="width: 32px; height: 32px;">
                <path d="M6 14.5 L11.5 20 L22 9" fill="none" stroke="#fff" stroke-width="3"
                    stroke-linecap="round" stroke-linejoin="round" />
            </svg>
        </div>
        <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 8px; color: #e2e8f0;">Email confirmed!</h2>
        <p style="font-size: 14px; color: #94a3b8;">You're all set. Let's finish setting up your account.</p>
    `;

    root.innerHTML = '';
    root.appendChild(wrapper);

    await wait(50);
    requestAnimationFrame(() => {
        wrapper.style.opacity = '1';
        wrapper.style.transform = 'translateY(0)';
    });

    await wait(1600);

    // Fade out before the next screen mounts
    wrapper.style.opacity = '0';
    wrapper.style.transform = 'translateY(-8px)';
    await wait(400);
}

function showWelcomeScreen(userId: string): void {
    const root = document.getElementById('welcome-root');
    if (!root) return;

    root.innerHTML = `
        <div id="welcome-card" style="
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 16px;
            padding: 40px 32px 32px;
            text-align: center;
            opacity: 0;
            transform: translateY(8px);
            transition: opacity 0.4s ease, transform 0.4s ease;
        ">
            <img src="assets/landing/logos/remi-text-logo.png" alt="REMi" style="height: 40px; margin: 0 auto 28px; display: block;" />
            <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 8px;">Welcome to REMi</h2>
            <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 28px;">
                Looks like this is your first time here.<br>Would you like to set up your account?
            </p>
            <button id="welcome-yes" style="
                width: 100%;
                height: 50px;
                border: none;
                border-radius: 10px;
                background: #135bec;
                color: #fff;
                font-size: 15px;
                font-weight: 700;
                font-family: 'Space Grotesk', sans-serif;
                cursor: pointer;
                transition: background 0.2s;
            " onmouseover="this.style.background='#0f4bc4'" onmouseout="this.style.background='#135bec'">Let's get started</button>
            <p id="welcome-no" style="
                margin-top: 16px;
                font-size: 12px;
                color: #475569;
                cursor: pointer;
                transition: color 0.2s;
            ">not right now</p>
        </div>
    `;

    // Animate in
    requestAnimationFrame(() => {
        const card = document.getElementById('welcome-card');
        if (card) {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }
    });

    // "Let's get started" → show profile form
    document.getElementById('welcome-yes')!.addEventListener('click', () => {
        showProfileForm(userId);
    });

    // "not right now" → sign out and go home
    document.getElementById('welcome-no')!.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = '/index.html';
    });

    // Subtle hover for "not right now"
    const noLink = document.getElementById('welcome-no')!;
    noLink.addEventListener('mouseover', () => { noLink.style.color = '#64748b'; });
    noLink.addEventListener('mouseout', () => { noLink.style.color = '#475569'; });
}

function showProfileForm(userId: string): void {
    const root = document.getElementById('welcome-root');
    if (!root) return;

    // Fade out current card, then replace
    const oldCard = document.getElementById('welcome-card');
    if (oldCard) {
        oldCard.style.opacity = '0';
        oldCard.style.transform = 'translateY(-8px)';
    }

    setTimeout(() => {
        root.innerHTML = `
            <div id="profile-card" style="
                background: #1e293b;
                border: 1px solid #334155;
                border-radius: 16px;
                padding: 40px 32px 32px;
                opacity: 0;
                transform: translateY(8px);
                transition: opacity 0.4s ease, transform 0.4s ease;
            ">
                <img src="assets/landing/logos/remi-text-logo.png" alt="REMi" style="height: 40px; margin: 0 auto 28px; display: block;" />
                <h2 style="text-align: center; font-size: 22px; font-weight: 700; margin-bottom: 4px;">Set up your profile</h2>
                <p style="text-align: center; font-size: 14px; color: #94a3b8; margin-bottom: 24px;">Tell us a bit about yourself</p>

                <div id="profile-error" style="
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

                <form id="profile-form" style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <input id="pf-firstname" type="text" placeholder="First name" required style="
                            width: 100%; height: 48px; padding: 0 16px; border-radius: 10px;
                            border: 1px solid #475569; background: #0f172a; color: #fff;
                            font-size: 15px; font-family: 'Space Grotesk', sans-serif;
                            outline: none; transition: border-color 0.2s; box-sizing: border-box;
                        " onfocus="this.style.borderColor='#135bec'" onblur="this.style.borderColor='#475569'" />
                        <input id="pf-lastname" type="text" placeholder="Last name" required style="
                            width: 100%; height: 48px; padding: 0 16px; border-radius: 10px;
                            border: 1px solid #475569; background: #0f172a; color: #fff;
                            font-size: 15px; font-family: 'Space Grotesk', sans-serif;
                            outline: none; transition: border-color 0.2s; box-sizing: border-box;
                        " onfocus="this.style.borderColor='#135bec'" onblur="this.style.borderColor='#475569'" />
                    </div>
                    <div style="position: relative;">
                        <select id="pf-trades" required style="
                            width: 100%; height: 48px; padding: 0 16px; border-radius: 10px;
                            border: 1px solid #475569; background: #0f172a; color: #fff;
                            font-size: 15px; font-family: 'Space Grotesk', sans-serif;
                            outline: none; transition: border-color 0.2s; box-sizing: border-box;
                            appearance: none; cursor: pointer;
                        " onfocus="this.style.borderColor='#135bec'" onblur="this.style.borderColor='#475569'">
                            <option value="" disabled selected>What do you trade?</option>
                            <option value="stocks">Stocks</option>
                            <option value="crypto">Crypto</option>
                            <option value="both">Both</option>
                        </select>
                        <span style="position: absolute; right: 14px; top: 50%; transform: translateY(-50%); pointer-events: none; color: #94a3b8;">&#9662;</span>
                    </div>
                    <div style="position: relative;">
                        <select id="pf-experience" required style="
                            width: 100%; height: 48px; padding: 0 16px; border-radius: 10px;
                            border: 1px solid #475569; background: #0f172a; color: #fff;
                            font-size: 15px; font-family: 'Space Grotesk', sans-serif;
                            outline: none; transition: border-color 0.2s; box-sizing: border-box;
                            appearance: none; cursor: pointer;
                        " onfocus="this.style.borderColor='#135bec'" onblur="this.style.borderColor='#475569'">
                            <option value="" disabled selected>How experienced are you?</option>
                            <option value="beginner">Beginner — still learning the basics</option>
                            <option value="intermediate">Intermediate — trading for 1–3 years</option>
                            <option value="experienced">Experienced — 3+ years, comfortable with indicators</option>
                        </select>
                        <span style="position: absolute; right: 14px; top: 50%; transform: translateY(-50%); pointer-events: none; color: #94a3b8;">&#9662;</span>
                    </div>
                    <button id="pf-submit" type="submit" style="
                        width: 100%; height: 50px; border: none; border-radius: 10px;
                        background: #135bec; color: #fff; font-size: 15px; font-weight: 700;
                        font-family: 'Space Grotesk', sans-serif; cursor: pointer;
                        transition: background 0.2s; margin-top: 4px;
                        position: relative; overflow: hidden;
                    " onmouseover="this.style.background='#0f4bc4'" onmouseout="this.style.background='#135bec'">
                        <span class="btn-text">Complete Setup</span>
                        <svg class="checkmark-svg" viewBox="0 0 28 28" style="
                            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                            width: 28px; height: 28px; opacity: 0;
                        "><path d="M6 14.5 L11.5 20 L22 9" fill="none" stroke="#fff" stroke-width="3"
                            stroke-linecap="round" stroke-linejoin="round"
                            style="stroke-dasharray: 30; stroke-dashoffset: 30;" /></svg>
                    </button>
                </form>
            </div>
        `;

        // Animate in
        requestAnimationFrame(() => {
            const card = document.getElementById('profile-card');
            if (card) {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }
        });

        // Handle form submit
        document.getElementById('profile-form')!.addEventListener('submit', (e) => {
            e.preventDefault();
            handleProfileSubmit(userId);
        });
    }, 400); // Wait for fade-out
}

async function handleProfileSubmit(userId: string): Promise<void> {
    const firstName = (document.getElementById('pf-firstname') as HTMLInputElement).value.trim();
    const lastName = (document.getElementById('pf-lastname') as HTMLInputElement).value.trim();
    const trades = (document.getElementById('pf-trades') as HTMLSelectElement).value;
    const experience = (document.getElementById('pf-experience') as HTMLSelectElement).value;
    const errorEl = document.getElementById('profile-error');

    // Hide previous errors
    if (errorEl) errorEl.style.display = 'none';

    // Validate required fields — focus the first empty one for quick keyboard recovery
    const firstInvalid: [string, boolean][] = [
        ['pf-firstname', !firstName],
        ['pf-lastname', !lastName],
        ['pf-trades', !trades],
        ['pf-experience', !experience],
    ];
    const invalidId = firstInvalid.find(([, empty]) => empty)?.[0];
    if (invalidId) {
        if (errorEl) {
            errorEl.textContent = 'All fields are required to set up your profile.';
            errorEl.style.display = 'block';
        }
        (document.getElementById(invalidId) as HTMLElement | null)?.focus();
        return;
    }

    // Disable submit button while request is in flight
    const submitBtn = document.getElementById('pf-submit') as HTMLButtonElement;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.7';
        submitBtn.style.cursor = 'not-allowed';
    }

    // Update user metadata in Supabase
    const { error } = await supabase.auth.updateUser({
        data: {
            first_name: firstName,
            last_name: lastName,
            trades,
            experience_level: experience,
            profile_complete: true,
        }
    });

    if (error) {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
        }
        if (errorEl) {
            errorEl.textContent = 'Something went wrong. Please try again.';
            errorEl.style.display = 'block';
        }
        return;
    }

    // Success — run morphing button animation, show welcome moment, then redirect
    await playSuccessAnimation();
    await showWelcomeMoment(firstName);
    window.location.href = getDestination(userId);
}

function spawnConfetti(btn: HTMLElement): void {
    const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6eb4', '#a78bfa', '#f472b6', '#34d399'];
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    for (let i = 0; i < 32; i++) {
        const piece = document.createElement('div');
        piece.style.cssText = `
            position: fixed; pointer-events: none; z-index: 9999;
            width: ${4 + Math.random() * 6}px;
            height: ${4 + Math.random() * 6}px;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
            left: ${cx}px; top: ${cy}px;
        `;

        const angle = (Math.PI * 2 * i) / 32 + (Math.random() - 0.5) * 0.5;
        const velocity = 80 + Math.random() * 120;
        const dx = Math.cos(angle) * velocity;
        const dy = Math.sin(angle) * velocity - 40;
        const rotation = Math.random() * 720 - 360;

        document.body.appendChild(piece);

        piece.animate([
            { opacity: 1, transform: 'translate(0, 0) rotate(0deg) scale(1)' },
            { opacity: 0, transform: `translate(${dx}px, ${dy}px) rotate(${rotation}deg) scale(0.2)` }
        ], {
            duration: 600 + Math.random() * 400,
            easing: 'cubic-bezier(0, 0.5, 0.5, 1)',
            fill: 'forwards',
        });

        setTimeout(() => piece.remove(), 1200);
    }
}

function wait(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

async function playSuccessAnimation(): Promise<void> {
    const btn = document.getElementById('pf-submit') as HTMLElement;
    if (!btn) return;

    const btnText = btn.querySelector('.btn-text') as HTMLElement;
    const checkSvg = btn.querySelector('.checkmark-svg') as SVGElement;
    const checkPath = btn.querySelector('.checkmark-svg path') as SVGPathElement;

    // Disable hover effects during animation
    btn.onmouseover = null;
    btn.onmouseout = null;

    // Phase 1: Text fades out (0.15s)
    if (btnText) btnText.style.transition = 'opacity 0.15s ease';
    if (btnText) btnText.style.opacity = '0';
    await wait(150);

    // Phase 2: Button shrinks to circle (0.7s)
    btn.style.transition = 'width 0.7s cubic-bezier(0.4, 0, 0.2, 1), height 0.7s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.7s cubic-bezier(0.4, 0, 0.2, 1), background 0.7s cubic-bezier(0.4, 0, 0.2, 1)';
    btn.style.width = '52px';
    btn.style.height = '52px';
    btn.style.borderRadius = '50%';
    btn.style.background = '#57d5ff';
    btn.style.margin = '4px auto 0';
    btn.style.display = 'block';
    await wait(750);

    // Phase 3: Checkmark draws (0.7s)
    if (checkSvg) checkSvg.style.opacity = '1';
    if (checkPath) {
        checkPath.style.transition = 'stroke-dashoffset 0.7s cubic-bezier(0.4, 0, 0.2, 1)';
        checkPath.style.strokeDashoffset = '0';
    }

    // Confetti burst at same time as checkmark
    spawnConfetti(btn);

    await wait(700);

    // Phase 4: Hold (0.4s)
    await wait(400);
}

async function showWelcomeMoment(firstName: string): Promise<void> {
    const root = document.getElementById('welcome-root');
    if (!root) return;

    const displayName = firstName.trim() || 'there';

    const wrapper = document.createElement('div');
    wrapper.id = 'welcome-moment';
    wrapper.style.cssText = 'text-align: center; opacity: 0; transform: translateY(8px); transition: opacity 0.5s ease, transform 0.5s ease;';

    const heading = document.createElement('h2');
    heading.style.cssText = 'font-size: 28px; font-weight: 700; margin-bottom: 8px; color: #e2e8f0;';
    heading.textContent = `Welcome, ${displayName}.`;

    const subtitle = document.createElement('p');
    subtitle.style.cssText = 'font-size: 15px; color: #94a3b8;';
    subtitle.textContent = 'Your dashboard is ready.';

    wrapper.appendChild(heading);
    wrapper.appendChild(subtitle);
    root.innerHTML = '';
    root.appendChild(wrapper);

    await wait(50); // allow DOM to settle before animating
    requestAnimationFrame(() => {
        const el = document.getElementById('welcome-moment');
        if (el) {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }
    });

    await wait(1500);
}

init();
