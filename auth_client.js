/* ============================================================
   BOLLYWOOD PARTY ARCADE - AUTHENTICATION, SUBSCRIPTIONS & ADMIN ENGINE
   Handles:
   - Mobile Number & OTP Verification
   - Free vs Paid Plan Validation (1 play per game, max 5 quizzes)
   - Subscription Upgrades (1 Day, 7 Days, 1 Month)
   - Auto Expiry Handling
   - Admin Management Dashboard & Reporting
   ============================================================ */

(function () {
    'use strict';

    const TOKEN_KEY = 'bollywood_arcade_token';

    // State
    const authState = {
        token: localStorage.getItem(TOKEN_KEY) || null,
        user: null, // { id, mobile, name, role, plan, subscription_plan, subscription_expires_at, ... }
        gamePlays: {}, // { intro: 1, still: 1, ... }
        plans: {},
        msg91: { enabled: false, widgetId: '', tokenAuth: '', primaryChannel: 'whatsapp' },
        pendingAction: null, // Callback to resume after login
        currentMobile: '',
        isResetPin: false,
        otpMobile: '',
        otpCountdown: 0,
        otpTimer: null
    };

    const $ = (id) => document.getElementById(id);

    // API Helper
    async function apiRequest(endpoint, method = 'GET', body = null) {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (authState.token) {
            headers['Authorization'] = `Bearer ${authState.token}`;
        }

        const opts = { method, headers };
        if (body && method !== 'GET') {
            opts.body = JSON.stringify(body);
        }

        try {
            const resp = await fetch(endpoint, opts);
            const data = await resp.json();
            return { ok: resp.ok, status: resp.status, data };
        } catch (err) {
            console.error('API Error:', endpoint, err);
            return { ok: false, status: 0, data: { status: 'error', message: 'Network connection error' } };
        }
    }

    // ============================================================
    // AUTH MANAGER CONTROLLER
    // ============================================================
    window.authManager = {
        get currentUser() { return authState.user; },
        get gamePlays() { return authState.gamePlays; },
        get token() { return authState.token; },

        isLoggedIn() {
            return !!(authState.user && authState.token);
        },

        isPaid() {
            return this.isLoggedIn() && authState.user.plan === 'paid';
        },

        isAdmin() {
            return this.isLoggedIn() && authState.user.role === 'admin';
        },

        hasUsedFreeTrial(gameId) {
            if (this.isPaid()) return false;
            return !!(authState.gamePlays && authState.gamePlays[gameId] >= 1);
        },

        // Initialize user session on page load
        async init() {
            if (authState.token) {
                const res = await apiRequest('/api/auth/me');
                if (res.ok && res.data.user) {
                    authState.user = res.data.user;
                    authState.gamePlays = res.data.game_plays || {};
                    authState.plans = res.data.plans || {};
                } else {
                    // Token invalid/expired
                    this.logout(false);
                }
            } else {
                // Fetch plans for display
                const res = await apiRequest('/api/subscription/plans');
                if (res.ok && res.data.plans) {
                    authState.plans = res.data.plans;
                }
            }
            // Fetch public MSG91 client configuration
            const mres = await apiRequest('/api/auth/msg91-config');
            if (mres.ok && mres.data.config) {
                authState.msg91 = mres.data.config;
                this.updateMsg91UI();
            }

            this.renderUserUI();
            this.updateRoundPillsUI();
        },

        // Update UI components across screens
        renderUserUI() {
            const container = $('authBarContainer');
            if (!container) return;

            if (!this.isLoggedIn()) {
                container.innerHTML = `
                    <div class="user-chip-guest" onclick="authManager.showAuthModal()">
                        <span class="user-chip-icon">👤</span>
                        <span class="user-chip-text">Sign In / Register</span>
                        <span class="user-chip-badge badge-free">Free Trial</span>
                    </div>
                `;
            } else {
                const u = authState.user;
                const isPaid = u.plan === 'paid';
                const isAdmin = u.role === 'admin';

                let displayName = u.name ? u.name.trim() : '';
                if (!displayName || /^\d+$/.test(displayName) || displayName === u.mobile) {
                    displayName = isAdmin ? 'Super Admin' : 'Bollywood Fan';
                }

                let formattedMobile = u.mobile || '';
                if (formattedMobile.length === 10) {
                    formattedMobile = `+91 ${formattedMobile.slice(0, 5)} ${formattedMobile.slice(5)}`;
                }

                let planBadge = '';
                if (isPaid) {
                    let expiryText = 'Active';
                    if (u.subscription_expires_at) {
                        try {
                            const exp = new Date(u.subscription_expires_at);
                            const now = new Date();
                            const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
                            expiryText = diffDays > 1 ? `${diffDays}d left` : '1d left';
                        } catch (e) {}
                    }
                    planBadge = `<span class="user-chip-badge badge-pro">💎 PRO (${expiryText})</span>`;
                } else {
                    const playedCount = Object.keys(authState.gamePlays).length;
                    planBadge = `<span class="user-chip-badge badge-free" onclick="authManager.showUpgradeModal('banner')">Free (${playedCount}/7 played) ⚡ Upgrade</span>`;
                }

                container.innerHTML = `
                    <div class="user-profile-strip">
                        <div class="user-info-group">
                            <div class="user-avatar-badge">${isAdmin ? '👑' : '🎵'}</div>
                            <div class="user-text-meta">
                                <span class="user-name-title">${escapeHtml(displayName)}</span>
                                <span class="user-mobile-sub">${escapeHtml(formattedMobile)}</span>
                            </div>
                            ${planBadge}
                        </div>
                        <div class="user-actions-group">
                            ${!isPaid ? `
                                <button type="button" class="btn-user-action btn-action-upgrade" onclick="authManager.showUpgradeModal('navbar')">
                                    <span>💎 Upgrade</span>
                                </button>
                            ` : ''}
                            ${isAdmin ? `
                                <button type="button" class="btn-user-action btn-action-admin" onclick="authManager.showAdminModal()">
                                    <span>👑 Admin Panel</span>
                                </button>
                            ` : ''}
                            <button type="button" class="btn-user-action btn-action-logout" onclick="authManager.logout()" title="Sign Out">
                                <span>🚪 Sign Out</span>
                            </button>
                        </div>
                    </div>
                `;
            }

            // Sync with Hub game cards
            this.syncHubGameCards();
        },

        // Lock/Unlock round pills on start screens depending on user plan
        updateRoundPillsUI() {
            const isPaid = this.isPaid();

            // Screen 1: Music Quiz count pills
            document.querySelectorAll('#songCountPills .count-pill').forEach(pill => {
                const count = pill.getAttribute('data-count');
                const isRestricted = !isPaid && count !== '5';
                pill.classList.toggle('pill-pro-locked', isRestricted);
                
                // Add lock icon if restricted and not already present
                let lock = pill.querySelector('.pill-lock-icon');
                if (isRestricted) {
                    if (!lock) {
                        lock = document.createElement('span');
                        lock.className = 'pill-lock-icon';
                        lock.textContent = ' 🔒';
                        pill.appendChild(lock);
                    }
                } else if (lock) {
                    lock.remove();
                }
            });

            // Screen 3: Party Games count pills
            document.querySelectorAll('#partyCountPills .count-pill').forEach(pill => {
                const count = pill.getAttribute('data-count');
                const isRestricted = !isPaid && count !== '5';
                pill.classList.toggle('pill-pro-locked', isRestricted);

                let lock = pill.querySelector('.pill-lock-icon');
                if (isRestricted) {
                    if (!lock) {
                        lock = document.createElement('span');
                        lock.className = 'pill-lock-icon';
                        lock.textContent = ' 🔒';
                        pill.appendChild(lock);
                    }
                } else if (lock) {
                    lock.remove();
                }
            });
        },

        // Mark Hub game cards with free status
        syncHubGameCards() {
            const isPaid = this.isPaid();
            const playedGames = authState.gamePlays || {};

            const modeMap = {
                'openMusicGame(\'intro\')': 'intro',
                'openMusicGame(\'stanza\')': 'stanza',
                'selectPartyGame(\'still\')': 'still',
                'selectPartyGame(\'emoji\')': 'emoji',
                'selectPartyGame(\'lyrics\')': 'lyrics',
                'selectPartyGame(\'dialogue\')': 'dialogue',
                'selectPartyGame(\'clip\')': 'clip'
            };

            document.querySelectorAll('.hub-card').forEach(card => {
                const onclickAttr = card.getAttribute('onclick') || '';
                let gameId = null;
                for (const [key, val] of Object.entries(modeMap)) {
                    if (onclickAttr.includes(val)) {
                        gameId = val;
                        break;
                    }
                }

                if (!gameId) return;

                // Clean up any old squished tag from the header if it existed
                const oldTag = card.querySelector('.trial-status-tag');
                if (oldTag) oldTag.remove();

                const hasPlayed = !isPaid && (playedGames[gameId] && playedGames[gameId] >= 1);
                card.classList.toggle('card-trial-completed', hasPlayed);

                // Elegant Trial Banner in Card Body
                let banner = card.querySelector('.card-trial-banner');
                const footerBtn = card.querySelector('.btn-card-launch');

                if (hasPlayed) {
                    if (!banner) {
                        banner = document.createElement('div');
                        banner.className = 'card-trial-banner';
                        banner.innerHTML = `<span class="trial-banner-icon">🔒</span> <span class="trial-banner-text">Free Trial Completed &bull; Upgrade to Replay</span>`;
                        const cardBody = card.querySelector('.hub-card-body');
                        if (cardBody) {
                            cardBody.appendChild(banner);
                        }
                    }
                    if (footerBtn && !footerBtn.getAttribute('data-orig-text')) {
                        footerBtn.setAttribute('data-orig-text', footerBtn.innerHTML);
                        footerBtn.innerHTML = `<span>🔒 Unlock with Pro</span><span class="arrow-icon">💎</span>`;
                        footerBtn.classList.add('btn-pro-locked');
                    }
                } else {
                    if (banner) banner.remove();
                    if (footerBtn && footerBtn.getAttribute('data-orig-text')) {
                        footerBtn.innerHTML = footerBtn.getAttribute('data-orig-text');
                        footerBtn.removeAttribute('data-orig-text');
                        footerBtn.classList.remove('btn-pro-locked');
                    }
                }
            });
        },

        // ============================================================
        // MSG91 & WHATSAPP INTEGRATION HELPERS
        // ============================================================
        updateMsg91UI() {
            const cfg = authState.msg91 || {};
            const badge = $('authWhatsAppBadge');
            const widgetBox = $('msg91WidgetBox');
            const channelBadge = $('otpChannelDisplayBadge');

            if (cfg.enabled) {
                if (badge) badge.classList.remove('hidden');
                if (channelBadge) {
                    channelBadge.textContent = '💬 on WhatsApp / SMS';
                    channelBadge.className = 'otp-channel-tag otp-channel-wa';
                }
                if (widgetBox && cfg.widgetId) {
                    widgetBox.classList.remove('hidden');
                }
            } else {
                if (badge) badge.classList.add('hidden');
                if (channelBadge) {
                    channelBadge.textContent = '📱 on SMS / Mock OTP';
                    channelBadge.className = 'otp-channel-tag otp-channel-sms';
                }
                if (widgetBox) widgetBox.classList.add('hidden');
            }
        },

        launchMsg91Widget() {
            const cfg = authState.msg91;
            if (!cfg || !cfg.widgetId) {
                alert('MSG91 Widget ID is not configured yet. Please configure it in the Admin Panel.');
                return;
            }

            if (typeof window.initSendOTP !== 'function') {
                alert('MSG91 OTP library is loading or blocked by an ad-blocker. You can use the standard OTP login above.');
                return;
            }

            const mobile = $('authMobileInput') ? $('authMobileInput').value.trim() : '';
            const name = $('authNameInput') ? $('authNameInput').value.trim() : '';

            const widgetConfiguration = {
                widgetId: cfg.widgetId,
                tokenAuth: cfg.tokenAuth || '',
                identifier: mobile ? (mobile.startsWith('91') ? mobile : '91' + mobile) : '',
                success: async (data) => {
                    console.log('MSG91 Widget verification success:', data);
                    const accessToken = (data && (data.message || data['access-token'] || data.accessToken)) || data;
                    if (!accessToken) {
                        alert('Could not retrieve access token from MSG91 widget.');
                        return;
                    }

                    const res = await apiRequest('/api/auth/msg91-verify-token', 'POST', {
                        accessToken: typeof accessToken === 'string' ? accessToken : JSON.stringify(accessToken),
                        name: name
                    });

                    if (res.ok && res.data.token) {
                        authState.token = res.data.token;
                        authState.user = res.data.user;
                        authState.gamePlays = res.data.game_plays || {};
                        localStorage.setItem(TOKEN_KEY, res.data.token);

                        this.hideAuthModal();
                        this.renderUserUI();
                        this.updateRoundPillsUI();

                        if (typeof window.triggerConfetti === 'function') {
                            window.triggerConfetti();
                        }

                        if (typeof authState.pendingAction === 'function') {
                            const action = authState.pendingAction;
                            authState.pendingAction = null;
                            action();
                        }
                    } else {
                        alert(res.data.message || 'Token verification failed. Please try again.');
                    }
                },
                failure: (error) => {
                    console.error('MSG91 Widget failure:', error);
                    alert('MSG91 verification was cancelled or encountered an error.');
                }
            };

            try {
                window.initSendOTP(widgetConfiguration);
            } catch (err) {
                console.error('Error invoking initSendOTP:', err);
                alert('Error opening MSG91 widget. Please use the standard phone number login.');
            }
        },

        // ============================================================
        // PLAY VALIDATION (FREE VS PAID GATEWAY)
        // ============================================================
        async checkCanPlay(gameId, roundsRequested = 5, onAllowedCallback = null) {
            // 1. Must be logged in
            if (!this.isLoggedIn()) {
                this.showAuthModal(() => {
                    if (typeof onAllowedCallback === 'function') {
                        onAllowedCallback();
                    }
                });
                return false;
            }

            // 2. Paid user: always allowed
            if (this.isPaid()) {
                // Record play silently
                await apiRequest('/api/game/record-play', 'POST', { gameId, rounds: roundsRequested });
                return true;
            }

            // 3. Free user validation
            // Rule A: Max 5 quizzes per game
            if (roundsRequested > 5) {
                this.showUpgradeModal('rounds_limit', {
                    title: 'Unlock All Quiz Counts',
                    desc: `Free tier is limited to <strong>5 quizzes</strong> per round. Upgrade to a Paid Pass to unlock <strong>10, 15, and 20 quizzes</strong>!`
                });
                return false;
            }

            // Rule B: Each game can be played ONCE only
            const alreadyPlayed = authState.gamePlays[gameId] && authState.gamePlays[gameId] >= 1;
            if (alreadyPlayed) {
                this.showUpgradeModal('game_limit', {
                    title: 'Free Trial Completed for This Game',
                    desc: `You have already enjoyed your free trial for this game! Upgrade to a Paid Pass to play unlimited times across all 7 Bollywood games.`
                });
                return false;
            }

            // Call backend to record and verify
            const res = await apiRequest('/api/game/record-play', 'POST', { gameId, rounds: roundsRequested });
            if (res.ok && res.data.allowed) {
                // Record successful play locally
                authState.gamePlays[gameId] = (authState.gamePlays[gameId] || 0) + 1;
                this.renderUserUI();
                return true;
            } else {
                // Blocked by backend
                this.showUpgradeModal(res.data.code || 'upgrade_required', {
                    title: 'Upgrade Required',
                    desc: res.data.message || 'Upgrade to Paid Plan to continue playing!'
                });
                return false;
            }
        },

        // ============================================================
        // MODALS (AUTH, UPGRADE, ADMIN)
        // ============================================================

        showAuthModal(onSuccessCallback = null) {
            authState.pendingAction = onSuccessCallback;
            const modal = $('authModal');
            if (modal) {
                modal.classList.add('active');
                this.switchAuthStep('phone');
                if ($('authMobileInput')) {
                    $('authMobileInput').value = authState.currentMobile || '';
                    $('authMobileInput').focus();
                }
            }
        },

        hideAuthModal() {
            const modal = $('authModal');
            if (modal) modal.classList.remove('active');
            clearInterval(authState.otpTimer);
        },

        switchAuthStep(step) {
            // step: 'phone' | 'pin' | 'otp' | 'setpin'
            if ($('authStepPhone')) $('authStepPhone').classList.toggle('hidden', step !== 'phone');
            if ($('authStepPin')) $('authStepPin').classList.toggle('hidden', step !== 'pin');
            if ($('authStepOtp')) $('authStepOtp').classList.toggle('hidden', step !== 'otp');
            if ($('authStepSetPin')) $('authStepSetPin').classList.toggle('hidden', step !== 'setpin');

            // Clear errors
            ['authErrorMsg', 'authPinErrorMsg', 'authOtpErrorMsg', 'authSetPinErrorMsg'].forEach(id => {
                const el = $(id);
                if (el) el.classList.add('hidden');
            });
        },

        // Triggered when user enters 10-digit phone number and clicks "Continue"
        async handlePhoneContinue() {
            const input = $('authMobileInput');
            const errBox = $('authErrorMsg');
            const btn = $('btnSendOtp');
            if (!input) return;

            const mobile = input.value.trim().replace(/\D/g, '');
            if (errBox) errBox.classList.add('hidden');

            if (!mobile || mobile.length !== 10) {
                if (errBox) {
                    errBox.textContent = 'Please enter a valid 10-digit Indian mobile number';
                    errBox.classList.remove('hidden');
                }
                return;
            }

            authState.currentMobile = mobile;

            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span>Checking account...</span>';
            }

            const res = await apiRequest('/api/auth/check-mobile', 'POST', { mobile });
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>📲 Continue &rarr;</span>';
            }

            if (res.ok && res.data.data) {
                const info = res.data.data;
                if (info.registered && info.has_pin) {
                    // Existing User with PIN set -> Ask for 6-Digit PIN
                    this.switchAuthStep('pin');
                    if ($('pinUserNameDisplay')) {
                        $('pinUserNameDisplay').textContent = info.name ? info.name : `Bollywood Fan (+91 ${mobile.slice(-4)})`;
                    }
                    if ($('authLoginPinInput')) {
                        $('authLoginPinInput').value = '';
                        $('authLoginPinInput').focus();
                    }
                } else {
                    // New user OR existing user without PIN -> Trigger 4-Digit OTP
                    authState.isResetPin = false;
                    this.triggerOtpSend(false);
                }
            } else {
                if (errBox) {
                    errBox.textContent = res.data.message || 'Unable to check mobile number. Please try again.';
                    errBox.classList.remove('hidden');
                }
            }
        },

        // Fast Login with 6-Digit PIN
        async loginWithPin() {
            const input = $('authLoginPinInput');
            const errBox = $('authPinErrorMsg');
            const btn = $('btnLoginPin');
            if (!input) return;

            const pin = input.value.trim();
            if (errBox) errBox.classList.add('hidden');

            if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
                if (errBox) {
                    errBox.textContent = 'Please enter your 6-digit PIN';
                    errBox.classList.remove('hidden');
                }
                return;
            }

            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span>Validating PIN...</span>';
            }

            const res = await apiRequest('/api/auth/login-pin', 'POST', {
                mobile: authState.currentMobile,
                pin: pin
            });

            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>🔓 Unlock &amp; Start Playing</span>';
            }

            if (res.ok && res.data.token) {
                this.completeLogin(res.data);
            } else {
                if (errBox) {
                    errBox.textContent = res.data.message || 'Incorrect PIN. Please try again or click Forgot PIN.';
                    errBox.classList.remove('hidden');
                }
            }
        },

        // Forgot PIN: Switch to OTP reset mode
        handleForgotPin() {
            authState.isResetPin = true;
            this.triggerOtpSend(false);
        },

        // Sends 4-digit OTP via MSG91 WhatsApp (with fallback)
        async triggerOtpSend(isResend = false) {
            const mobile = authState.currentMobile;
            this.switchAuthStep('otp');

            if ($('otpSentPhoneDisplay')) {
                $('otpSentPhoneDisplay').textContent = `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`;
            }
            if ($('authOtpInput')) {
                $('authOtpInput').value = '';
                $('authOtpInput').focus();
            }

            const res = await apiRequest('/api/auth/send-otp', 'POST', { mobile });
            if (res.ok) {
                const devBanner = $('devOtpBanner');
                if (devBanner && res.data.dev_otp) {
                    devBanner.innerHTML = `🔑 <strong>Demo OTP:</strong> <code id="quickOtpCode">${res.data.dev_otp}</code> <button type="button" class="btn-autofill-otp" onclick="authManager.autoFillOtp('${res.data.dev_otp}')">Auto-fill</button>`;
                    devBanner.classList.remove('hidden');
                }
                this.startOtpTimer();
            } else {
                const errBox = $('authOtpErrorMsg');
                if (errBox) {
                    errBox.textContent = res.data.message || 'Failed to dispatch WhatsApp OTP. Please try again.';
                    errBox.classList.remove('hidden');
                }
            }
        },

        autoFillOtp(code) {
            const input = $('authOtpInput');
            if (input) {
                input.value = code;
                this.verifyOtp();
            }
        },

        startOtpTimer() {
            clearInterval(authState.otpTimer);
            let seconds = 60;
            const timerEl = $('otpTimerCountdown');
            const resendBtn = $('btnResendOtp');
            if (resendBtn) resendBtn.disabled = true;

            authState.otpTimer = setInterval(() => {
                seconds--;
                if (timerEl) timerEl.textContent = `(${seconds}s)`;
                if (seconds <= 0) {
                    clearInterval(authState.otpTimer);
                    if (timerEl) timerEl.textContent = '';
                    if (resendBtn) resendBtn.disabled = false;
                }
            }, 1000);
        },

        // Verifies 4-digit OTP and proceeds to PIN creation / reset
        async verifyOtp() {
            const input = $('authOtpInput');
            const errBox = $('authOtpErrorMsg');
            const btn = $('btnVerifyOtp');
            if (!input) return;

            const otp = input.value.trim();
            if (errBox) errBox.classList.add('hidden');

            if (!otp || otp.length !== 4 || !/^\d{4}$/.test(otp)) {
                if (errBox) {
                    errBox.textContent = 'Please enter the complete 4-digit OTP';
                    errBox.classList.remove('hidden');
                }
                return;
            }

            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span>Verifying OTP...</span>';
            }

            const res = await apiRequest('/api/auth/verify-otp', 'POST', {
                mobile: authState.currentMobile,
                otp: otp
            });

            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>✅ Verify Code &rarr;</span>';
            }

            if (res.ok && res.data.token) {
                authState.token = res.data.token;
                authState.user = res.data.user;
                authState.gamePlays = res.data.game_plays || {};
                localStorage.setItem(TOKEN_KEY, res.data.token);

                // Move directly to Set / Reset 6-Digit PIN
                this.switchAuthStep('setpin');
                if ($('authSetPinTitle')) {
                    $('authSetPinTitle').textContent = authState.isResetPin ? 'Reset Your 6-Digit PIN' : 'Create Your 6-Digit PIN';
                }
                if ($('authNewNameInput')) {
                    $('authNewNameInput').value = (res.data.user && res.data.user.name && !res.data.user.name.startsWith('User ')) ? res.data.user.name : '';
                }
                if ($('authNewPinInput')) {
                    $('authNewPinInput').value = '';
                    $('authNewPinInput').focus();
                }
                if ($('authConfirmPinInput')) {
                    $('authConfirmPinInput').value = '';
                }
            } else {
                if (errBox) {
                    errBox.textContent = res.data.message || 'Invalid 4-digit OTP. Please check and try again.';
                    errBox.classList.remove('hidden');
                }
            }
        },

        // Saves new 6-digit PIN and completes authentication
        async saveNewPin() {
            const pin1 = $('authNewPinInput') ? $('authNewPinInput').value.trim() : '';
            const pin2 = $('authConfirmPinInput') ? $('authConfirmPinInput').value.trim() : '';
            const name = $('authNewNameInput') ? $('authNewNameInput').value.trim() : '';
            const errBox = $('authSetPinErrorMsg');
            const btn = $('btnSaveNewPin');
            if (errBox) errBox.classList.add('hidden');

            if (!pin1 || pin1.length !== 6 || !/^\d{6}$/.test(pin1)) {
                if (errBox) {
                    errBox.textContent = 'PIN must be exactly 6 digits';
                    errBox.classList.remove('hidden');
                }
                return;
            }

            if (pin1 !== pin2) {
                if (errBox) {
                    errBox.textContent = 'PINs do not match. Please re-enter identical 6 digits.';
                    errBox.classList.remove('hidden');
                }
                return;
            }

            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span>Saving PIN...</span>';
            }

            const res = await apiRequest('/api/auth/set-pin', 'POST', {
                mobile: authState.currentMobile,
                pin: pin1,
                name: name
            });

            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>💾 Save PIN &amp; Start Playing</span>';
            }

            if (res.ok && res.data.token) {
                this.completeLogin(res.data);
            } else {
                if (errBox) {
                    errBox.textContent = res.data.message || 'Failed to save PIN. Please try again.';
                    errBox.classList.remove('hidden');
                }
            }
        },

        completeLogin(data) {
            authState.token = data.token;
            authState.user = data.user;
            authState.gamePlays = data.game_plays || {};
            localStorage.setItem(TOKEN_KEY, data.token);

            this.hideAuthModal();
            this.renderUserUI();
            this.updateRoundPillsUI();

            if (typeof window.triggerConfetti === 'function') {
                window.triggerConfetti();
            }

            if (typeof authState.pendingAction === 'function') {
                const action = authState.pendingAction;
                authState.pendingAction = null;
                action();
            }
        },

        async logout(callApi = true) {
            if (callApi && authState.token) {
                await apiRequest('/api/auth/logout', 'POST');
            }
            authState.token = null;
            authState.user = null;
            authState.gamePlays = {};
            localStorage.removeItem(TOKEN_KEY);
            // Fetch public MSG91 client configuration
            const mres = await apiRequest('/api/auth/msg91-config');
            if (mres.ok && mres.data.config) {
                authState.msg91 = mres.data.config;
                this.updateMsg91UI();
            }

            this.renderUserUI();
            this.updateRoundPillsUI();
        },

        // ============================================================
        // UPGRADE PAYWALL MODAL
        // ============================================================

        showUpgradeModal(reason = 'general', customText = null) {
            const modal = $('upgradeModal');
            if (!modal) return;

            const titleEl = $('upgradeModalTitle');
            const descEl = $('upgradeModalDesc');

            if (customText) {
                if (titleEl) titleEl.innerHTML = customText.title;
                if (descEl) descEl.innerHTML = customText.desc;
            } else {
                if (titleEl) titleEl.innerHTML = 'Upgrade to Bollywood Arcade PRO';
                if (descEl) descEl.innerHTML = 'Get unlimited access to all 7 party games, unlimited rounds, and big-screen TV mode!';
            }

            modal.classList.add('active');
        },

        hideUpgradeModal() {
            const modal = $('upgradeModal');
            if (modal) modal.classList.remove('active');
        },

        // Purchase / Upgrade Subscription
        async buyPlan(planId) {
            if (!this.isLoggedIn()) {
                this.hideUpgradeModal();
                this.showAuthModal(() => {
                    this.showUpgradeModal('post_login');
                });
                return;
            }

            const planConfig = authState.plans[planId] || { name: planId, price: 499 };
            
            // Show simulated Payment Confirmation Dialog
            const confirmPayment = confirm(
                `💳 Complete Payment\n\nPlan: ${planConfig.name}\nAmount: ₹${planConfig.price}\nPayment Method: UPI / GPay / PhonePe / Card\n\nClick OK to simulate instant activation!`
            );

            if (!confirmPayment) return;

            const res = await apiRequest('/api/subscription/upgrade', 'POST', {
                plan: planId,
                paymentMethod: 'UPI'
            });

            if (res.ok && res.data.user) {
                authState.user = res.data.user;
                this.hideUpgradeModal();
                this.renderUserUI();
                this.updateRoundPillsUI();

                if (typeof window.triggerConfetti === 'function') {
                    window.triggerConfetti();
                }

                alert(`🎉 PRO Access Activated!\n\nThank you! You now have unlimited access to all games until ${new Date(authState.user.subscription_expires_at).toLocaleDateString()}.`);
            } else {
                alert(res.data.message || 'Payment upgrade failed. Please try again.');
            }
        },

        // ============================================================
        // ADMIN DASHBOARD CONTROLLER
        // ============================================================

        async showAdminModal() {
            if (!this.isAdmin()) {
                alert('Access Denied. Admin privilege required.');
                return;
            }

            const modal = $('adminModal');
            if (modal) {
                modal.classList.add('active');
                this.loadAdminStats();
                this.loadAdminUsers();
            }
        },

        hideAdminModal() {
            const modal = $('adminModal');
            if (modal) modal.classList.remove('active');
        },

        switchAdminTab(tabName) {
            document.querySelectorAll('.admin-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === tabName);
            });
            $('adminTabStats').classList.toggle('hidden', tabName !== 'stats');
            $('adminTabUsers').classList.toggle('hidden', tabName !== 'users');
            if ($('adminTabMsg91')) {
                $('adminTabMsg91').classList.toggle('hidden', tabName !== 'msg91');
            }
            if (tabName === 'msg91') {
                this.loadAdminMsg91Settings();
            }
        },

        async loadAdminStats() {
            const res = await apiRequest('/api/admin/stats');
            if (!res.ok) return;

            const s = res.data.stats;
            $('adminTotalUsers').textContent = s.total_users;
            $('adminPaidUsers').textContent = s.paid_users;
            $('adminFreeUsers').textContent = s.free_users;
            $('adminTotalRevenue').textContent = `₹${s.total_revenue}`;
            $('adminTotalPlays').textContent = s.total_plays;

            // Render game plays breakdown
            const playsContainer = $('adminGamePlaysList');
            if (playsContainer) {
                const gameLabels = {
                    intro: '🎧 Sur Sartaaj (Intro)',
                    stanza: '🎙️ Antara Suno',
                    still: '🎬 Scene Dekho',
                    emoji: '🔤 Emoji Dhamaka',
                    lyrics: '🇬🇧 Angrezi Babu',
                    dialogue: '🗣️ Dialogue Baazi',
                    clip: '🎬 Action Replay'
                };

                let html = '<div class="admin-bars-list">';
                const maxPlays = Math.max(1, ...Object.values(s.plays_by_game || { dummy: 1 }));
                for (const [gid, label] of Object.entries(gameLabels)) {
                    const count = s.plays_by_game[gid] || 0;
                    const pct = Math.round((count / maxPlays) * 100);
                    html += `
                        <div class="admin-bar-row">
                            <span class="bar-label">${label}</span>
                            <div class="bar-track">
                                <div class="bar-fill" style="width: ${pct}%"></div>
                            </div>
                            <span class="bar-count">${count} plays</span>
                        </div>
                    `;
                }
                html += '</div>';
                playsContainer.innerHTML = html;
            }
        },

        async loadAdminUsers(planFilter = 'all') {
            const query = $('adminUserSearchInput') ? $('adminUserSearchInput').value.trim() : '';
            const res = await apiRequest(`/api/admin/users?q=${encodeURIComponent(query)}&plan=${planFilter}`);
            if (!res.ok) return;

            const users = res.data.users || [];
            const tbody = $('adminUsersTableBody');
            if (!tbody) return;

            if (users.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4">No users found matching query.</td></tr>`;
                return;
            }

            tbody.innerHTML = users.map(u => {
                const isPaid = u.plan === 'paid';
                const isAdmin = u.role === 'admin';
                return `
                    <tr>
                        <td><strong>${escapeHtml(u.mobile)}</strong></td>
                        <td>${escapeHtml(u.name || '-')}</td>
                        <td>
                            <span class="badge ${isAdmin ? 'badge-admin' : 'badge-user'}">
                                ${isAdmin ? '👑 Admin' : 'User'}
                            </span>
                        </td>
                        <td>
                            <span class="badge ${isPaid ? 'badge-pro' : 'badge-free'}">
                                ${isPaid ? '💎 PAID' : 'FREE'}
                            </span>
                        </td>
                        <td>${isPaid ? u.remaining_time : '-'}</td>
                        <td>${u.plays_count || 0}</td>
                        <td>
                            <div class="admin-row-actions">
                                <button class="btn-sm btn-action-free1d" onclick="authManager.adminSetPlan(${u.id}, 'paid', 1)" title="Grant 1 Day Free Pro Subscription">
                                    🎁 +1d Free
                                </button>
                                ${!isPaid ? `
                                    <button class="btn-sm btn-action-pro" onclick="authManager.adminSetPlan(${u.id}, 'paid', 7)" title="Upgrade to 7 Days">
                                        +7d Pro
                                    </button>
                                    <button class="btn-sm btn-action-pro" onclick="authManager.adminSetPlan(${u.id}, 'paid', 30)" title="Upgrade to 30 Days">
                                        +30d Pro
                                    </button>
                                ` : `
                                    <button class="btn-sm btn-action-revert" onclick="authManager.adminSetPlan(${u.id}, 'free')" title="Revert to Free">
                                        Reset Free
                                    </button>
                                `}
                                <button class="btn-sm btn-action-role" onclick="authManager.adminToggleRole(${u.id}, '${isAdmin ? 'user' : 'admin'}')" title="Toggle Admin">
                                    ${isAdmin ? 'Demote' : 'Make Admin'}
                                </button>
                                ${!isAdmin && u.mobile !== '9899259836' && u.mobile !== '9999999999' ? `
                                    <button class="btn-sm btn-action-delete" onclick="authManager.adminDeleteUser(${u.id}, '${escapeHtml(u.mobile)}', '${escapeHtml(u.name || '')}')" title="Delete User">
                                        🗑️ Delete
                                    </button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        },

        async adminDeleteUser(userId, mobile, name) {
            const displayName = name ? `${name} (+91 ${mobile})` : `+91 ${mobile}`;
            const confirmDel = confirm(`⚠️ Are you sure you want to permanently delete user:\n${displayName}?\n\nThis will remove their account, play history, and active subscriptions. This cannot be undone.`);
            if (!confirmDel) return;

            const res = await apiRequest('/api/admin/delete-user', 'POST', {
                targetUserId: userId
            });

            if (res.ok) {
                alert(`✅ User ${displayName} has been deleted.`);
                this.loadAdminStats();
                this.loadAdminUsers();
            } else {
                alert('❌ ' + (res.data.message || 'Failed to delete user'));
            }
        },

        async adminSetPlan(userId, plan, days = 30) {
            const res = await apiRequest('/api/admin/update-user', 'POST', {
                targetUserId: userId,
                plan: plan,
                customDays: days
            });
            if (res.ok) {
                this.loadAdminStats();
                this.loadAdminUsers();
                if (authState.user && authState.user.id === userId) {
                    authState.user = res.data.user;
                    this.renderUserUI();
                    this.updateRoundPillsUI();
                }
            } else {
                alert(res.data.message || 'Failed to update user plan');
            }
        },

        async adminToggleRole(userId, newRole) {
            const res = await apiRequest('/api/admin/update-user', 'POST', {
                targetUserId: userId,
                role: newRole
            });
            if (res.ok) {
                this.loadAdminStats();
                this.loadAdminUsers();
            } else {
                alert(res.data.message || 'Failed to update role');
            }
        },

        // ============================================================
        // ADMIN MSG91 & WHATSAPP CONFIGURATION
        // ============================================================
        async loadAdminMsg91Settings() {
            const res = await apiRequest('/api/admin/msg91-settings');
            if (!res.ok) return;

            const cfg = res.data.config || res.data.settings || {};
            const toggle = $('msg91EnabledToggle');
            if (toggle) toggle.checked = !!cfg.enabled;

            const statusDot = $('msg91StatusDot');
            const statusText = $('msg91StatusText');
            if (statusDot && statusText) {
                if (cfg.enabled && cfg.has_authkey && cfg.widgetId) {
                    statusDot.className = 'status-dot status-active';
                    statusText.innerHTML = '<strong>MSG91 Active:</strong> Real-time WhatsApp OTP routing is online';
                } else if (cfg.enabled) {
                    statusDot.className = 'status-dot status-warning';
                    statusText.innerHTML = '<strong>Partially Configured:</strong> Enabled, but Authkey or Widget ID is missing';
                } else {
                    statusDot.className = 'status-dot status-inactive';
                    statusText.innerHTML = '<strong>Mock Mode:</strong> MSG91 disabled (Instant test code auto-fills)';
                }
            }

            if ($('msg91AuthkeyInput')) {
                $('msg91AuthkeyInput').value = '';
                $('msg91AuthkeyInput').placeholder = cfg.has_authkey ? `•••••••••••••••• (Key Configured - Leave blank to keep)` : 'e.g. 419647ABcXyz...';
            }
            if ($('msg91WidgetIdInput')) {
                $('msg91WidgetIdInput').value = cfg.widgetId || '';
            }
            if ($('msg91TokenAuthInput')) {
                $('msg91TokenAuthInput').value = cfg.tokenAuth || '';
            }
            if ($('msg91ChannelSelect')) {
                $('msg91ChannelSelect').value = cfg.primaryChannel || 'whatsapp';
            }
        },

        toggleAuthkeyVisibility() {
            const input = $('msg91AuthkeyInput');
            if (!input) return;
            input.type = input.type === 'password' ? 'text' : 'password';
        },

        async saveAdminMsg91Settings() {
            const enabled = $('msg91EnabledToggle') ? $('msg91EnabledToggle').checked : false;
            const authkey = $('msg91AuthkeyInput') ? $('msg91AuthkeyInput').value.trim() : '';
            const widgetId = $('msg91WidgetIdInput') ? $('msg91WidgetIdInput').value.trim() : '';
            const tokenAuth = $('msg91TokenAuthInput') ? $('msg91TokenAuthInput').value.trim() : '';
            const primaryChannel = $('msg91ChannelSelect') ? $('msg91ChannelSelect').value : 'whatsapp';
            const alertBox = $('msg91SaveAlert');

            if (alertBox) alertBox.classList.add('hidden');

            const payload = {
                enabled,
                widgetId,
                tokenAuth,
                primaryChannel
            };
            // Only update authkey if admin typed a fresh, unmasked key
            if (authkey && !authkey.includes('*') && !authkey.includes('•') && authkey.length >= 8) {
                payload.authkey = authkey;
            }

            const btn = $('btnSaveMsg91');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span>Saving...</span>';
            }

            const res = await apiRequest('/api/admin/msg91-settings', 'POST', payload);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>💾 Save MSG91 Settings</span>';
            }

            if (res.ok) {
                if (alertBox) {
                    alertBox.className = 'auth-success-banner';
                    alertBox.innerHTML = '✅ MSG91 settings saved successfully!';
                    alertBox.classList.remove('hidden');
                    setTimeout(() => alertBox.classList.add('hidden'), 4000);
                }
                // Refresh client config & UI
                const mres = await apiRequest('/api/auth/msg91-config');
                if (mres.ok && mres.data.config) {
                    authState.msg91 = mres.data.config;
                    this.updateMsg91UI();
                }
                this.loadAdminMsg91Settings();
            } else {
                if (alertBox) {
                    alertBox.className = 'auth-error-banner';
                    alertBox.innerHTML = '❌ ' + (res.data.message || 'Failed to save settings');
                    alertBox.classList.remove('hidden');
                }
            }
        },

        async testAdminMsg91Otp() {
            const testMobile = $('msg91TestMobileInput') ? $('msg91TestMobileInput').value.trim() : '';
            const resultBox = $('msg91TestResultBox');

            if (!testMobile || testMobile.length !== 10 || !/^\d{10}$/.test(testMobile)) {
                if (resultBox) {
                    resultBox.className = 'test-result-box test-result-error';
                    resultBox.innerHTML = '⚠️ Please enter a valid 10-digit Indian mobile number.';
                    resultBox.classList.remove('hidden');
                }
                return;
            }

            const btn = $('btnSendTestOtp');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span>⏳ Sending...</span>';
            }

            if (resultBox) {
                resultBox.className = 'test-result-box';
                resultBox.innerHTML = 'Calling MSG91 SendOTP API via WhatsApp...';
                resultBox.classList.remove('hidden');
            }

            const res = await apiRequest('/api/admin/msg91-test', 'POST', { mobile: testMobile });
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>📲 Send Test OTP</span>';
            }

            if (res.ok && res.data.success) {
                if (resultBox) {
                    resultBox.className = 'test-result-box test-result-success';
                    resultBox.innerHTML = `✅ <strong>Success!</strong> WhatsApp OTP delivered.<br><small>MSG91 Request ID: <code>${escapeHtml(res.data.req_id || 'OK')}</code></small>`;
                }
            } else {
                if (resultBox) {
                    resultBox.className = 'test-result-box test-result-error';
                    resultBox.innerHTML = `❌ <strong>Failed:</strong> ${escapeHtml(res.data.message || 'API error')}`;
                }
            }
        }
    };

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => authManager.init());
    } else {
        authManager.init();
    }

})();
