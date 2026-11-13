/* ============================================================
   BOLLYWOOD ARCADE - ONLINE MULTIPLAYER CLIENT ENGINE
   Handles:
   - WebSocket connection with auto-reconnect
   - Host Room creation & WhatsApp link generation
   - Mobile audio playback synchronization
   - 4-Option multiple choice input with speed-bonus timing
   - Live real-time leaderboard & Grand Finale Podium
   ============================================================ */

(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);

    // Audio helper for UI sound effects (Web Audio API)
    const AudioFX = {
        ctx: null,
        init() {
            if (!this.ctx) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (AudioContext) this.ctx = new AudioContext();
            }
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        },
        playTone(freq, type = 'sine', duration = 0.15, vol = 0.25) {
            try {
                this.init();
                if (!this.ctx) return;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
                gain.gain.setValueAtTime(vol, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + duration);
            } catch (e) {}
        },
        tap() { this.playTone(520, 'triangle', 0.08, 0.2); },
        correct() {
            this.playTone(587.33, 'sine', 0.12, 0.3);
            setTimeout(() => this.playTone(880, 'sine', 0.28, 0.35), 100);
        },
        wrong() {
            this.playTone(280, 'sawtooth', 0.18, 0.25);
            setTimeout(() => this.playTone(220, 'sawtooth', 0.25, 0.3), 120);
        },
        countdown() { this.playTone(440, 'sine', 0.09, 0.25); },
        go() { this.playTone(880, 'sine', 0.25, 0.4); },
        fanfare() {
            [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
                setTimeout(() => this.playTone(f, 'triangle', 0.35, 0.3), i * 140);
            });
        }
    };

    // Client State
    const mpState = {
        roomCode: null,
        token: null,
        role: 'player', // 'host' | 'player'
        player: null,
        isHost: false,
        socket: null,
        connected: false,
        status: 'DISCONNECTED', // LOBBY | STARTING | QUESTION_ACTIVE | ROUND_REVEAL | GAME_OVER
        
        // Active Question
        roundIndex: 0,
        totalRounds: 0,
        gameType: 'dialogue',
        question: null,
        duration: 15,
        startTime: 0,
        timerInterval: null,
        hasAnswered: false,
        myAnswerIndex: null,
        
        // Media Audio Element
        mediaAudio: null,
        audioUnlocked: false,
        
        // Roster & Score
        players: [],
        leaderboard: [],
        podium: []
    };

    // Haptic feedback helper
    function haptic(type = 'tap') {
        if (!navigator.vibrate) return;
        try {
            if (type === 'tap') navigator.vibrate(14);
            else if (type === 'success') navigator.vibrate([30, 40, 40]);
            else if (type === 'error') navigator.vibrate(50);
        } catch (e) {}
    }

    // ============================================================
    // INITIALIZATION & URL PARSING
    // ============================================================
    function init() {
        const urlParams = new URLSearchParams(window.location.search);
        const room = urlParams.get('room');
        const token = urlParams.get('token');
        const role = urlParams.get('role');

        if (room && token) {
            mpState.roomCode = room.toUpperCase().trim();
            mpState.token = token.trim();
            mpState.role = (role === 'host' || token.startsWith('host_')) ? 'host' : 'player';
            mpState.isHost = (mpState.role === 'host');

            // Switch to Arena Screen immediately!
            showArenaScreen();
            connectWebSocket();
        }
    }

    // Switch screen to Multiplayer Arena
    function showArenaScreen() {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const arena = $('multiplayerArenaScreen');
        if (arena) arena.classList.add('active');

        // Update top bar room code
        const codeDisplay = $('mpRoomCodeDisplay');
        if (codeDisplay) codeDisplay.textContent = mpState.roomCode || '---';
    }

    // ============================================================
    // WEBSOCKET COMMUNICATION
    // ============================================================
    function connectWebSocket() {
        if (mpState.socket) {
            try { mpState.socket.close(); } catch (e) {}
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/multiplayer?room=${encodeURIComponent(mpState.roomCode)}&token=${encodeURIComponent(mpState.token)}`;

        updateConnectionBadge('connecting', 'Connecting...');

        const ws = new WebSocket(wsUrl);
        mpState.socket = ws;

        ws.onopen = () => {
            mpState.connected = true;
            updateConnectionBadge('connected', 'Live Online 🟢');
        };

        ws.onmessage = (event) => {
            try {
                const msg = jsonParse(event.data);
                if (msg) handleIncomingMessage(msg);
            } catch (err) {
                console.error('[WS PARSE ERR]', err);
            }
        };

        ws.onclose = () => {
            mpState.connected = false;
            updateConnectionBadge('disconnected', 'Disconnected 🔴');
            // Auto reconnect after 2.5s if game isn't over
            if (mpState.status !== 'GAME_OVER') {
                setTimeout(() => {
                    if (!mpState.connected && mpState.roomCode) {
                        connectWebSocket();
                    }
                }, 2500);
            }
        };

        ws.onerror = (err) => {
            console.error('[WS ERR]', err);
            updateConnectionBadge('error', 'Connection Error');
        };
    }

    function sendWs(payload) {
        if (mpState.socket && mpState.socket.readyState === WebSocket.OPEN) {
            mpState.socket.send(JSON.stringify(payload));
            return true;
        }
        return false;
    }

    function updateConnectionBadge(status, text) {
        const badge = $('mpConnectionBadge');
        if (badge) {
            badge.className = `mp-conn-badge conn-${status}`;
            badge.textContent = text;
        }
    }

    // Helper JSON parser
    function jsonParse(str) {
        try { return JSON.parse(str); } catch (e) { return null; }
    }

    // ============================================================
    // MESSAGE DISPATCHER
    // ============================================================
    function handleIncomingMessage(msg) {
        switch (msg.type) {
            case 'LOBBY_STATE':
                handleLobbyState(msg);
                break;
            case 'COUNTDOWN_START':
                handleCountdown(msg);
                break;
            case 'QUESTION_ACTIVE':
                handleQuestionActive(msg);
                break;
            case 'PLAYER_ANSWERED':
                handlePlayerAnswered(msg);
                break;
            case 'ROUND_REVEAL':
                handleRoundReveal(msg);
                break;
            case 'GAME_OVER':
                handleGameOver(msg);
                break;
            case 'PLAYER_SHOUT':
                showFloatingShout(msg);
                break;
            case 'ERROR':
                alert(msg.message || 'An error occurred.');
                break;
        }
    }

    // ============================================================
    // LOBBY PHASE
    // ============================================================
    function handleLobbyState(msg) {
        mpState.status = 'LOBBY';
        mpState.players = msg.players || [];
        mpState.gameType = msg.gameType || mpState.gameType;
        mpState.totalRounds = msg.roundCount || mpState.totalRounds;

        // Find self in player list
        const me = mpState.players.find(p => p.token === mpState.token);
        if (me) {
            mpState.player = me;
            const myAvatar = $('mpMyAvatar');
            const myName = $('mpMyName');
            if (myAvatar) myAvatar.textContent = me.avatar || '🎬';
            if (myName) myName.textContent = me.name || (mpState.isHost ? 'Host' : 'Player');
        }

        // Show Lobby view, hide others
        switchArenaView('lobby');

        // Update Game Info Pill in Lobby
        const gameTitles = {
            dialogue: '🗣️ Dialogue Baazi!',
            emoji: '🔤 Emoji Dhamaka!',
            lyrics: '🇬🇧 Angrezi Babu, Desi Gaana',
            still: '🎬 Scene Dekho!',
            intro: '🎧 Sur Sartaaj (Intro Music)',
            stanza: '🎙️ Antara Suno! (Stanza Quiz)',
            clip: '🎬 Action Replay (Video Scenes)'
        };
        const titleEl = $('mpLobbyGameTitle');
        if (titleEl) titleEl.textContent = `${gameTitles[mpState.gameType] || 'Bollywood Quiz'} • ${msg.roundCount} Rounds`;

        // Render Player Roster Cards
        renderPlayerRoster(mpState.players);

        // Host controls vs Player ready button
        const hostBtn = $('mpHostStartBtn');
        const playerBtn = $('mpPlayerReadyBtn');

        if (mpState.isHost) {
            if (hostBtn) {
                hostBtn.style.display = 'inline-flex';
                // Host can start anytime or when players joined
                hostBtn.disabled = (mpState.players.length < 1);
            }
            if (playerBtn) playerBtn.style.display = 'none';
        } else {
            if (hostBtn) hostBtn.style.display = 'none';
            if (playerBtn) {
                playerBtn.style.display = 'inline-flex';
                if (me && me.ready) {
                    playerBtn.classList.add('ready-confirmed');
                    playerBtn.innerHTML = '<span>✅ Sound Enabled &amp; Ready!</span>';
                    playerBtn.disabled = true;
                } else {
                    playerBtn.classList.remove('ready-confirmed');
                    playerBtn.innerHTML = '<span>🔊 I\'m Ready! (Enable Sound)</span>';
                    playerBtn.disabled = false;
                }
            }
        }
    }

    function renderPlayerRoster(players) {
        const container = $('mpPlayerRosterGrid');
        if (!container) return;

        container.innerHTML = players.map(p => {
            const isMe = (p.token === mpState.token);
            const statusBadge = p.isHost 
                ? '<span class="roster-badge host">Host 🎬</span>'
                : (p.ready 
                    ? '<span class="roster-badge ready">Ready ✅</span>' 
                    : '<span class="roster-badge waiting">Waiting...</span>');

            const onlineClass = p.connected ? 'online' : 'offline';

            return `
                <div class="roster-card ${isMe ? 'is-me' : ''} ${onlineClass}">
                    <div class="roster-avatar-wrap">
                        <span class="roster-avatar">${p.avatar || '🎭'}</span>
                        <span class="roster-dot ${onlineClass}"></span>
                    </div>
                    <div class="roster-details">
                        <div class="roster-name">${escapeHtml(p.name)} ${isMe ? '<span class="tag-you">(You)</span>' : ''}</div>
                        <div class="roster-status-row">${statusBadge}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Player clicks "I'm Ready! (Enable Sound)"
    function setPlayerReady() {
        AudioFX.init();
        AudioFX.tap();
        haptic('tap');
        mpState.audioUnlocked = true;

        sendWs({ action: 'ready' });

        const btn = $('mpPlayerReadyBtn');
        if (btn) {
            btn.classList.add('ready-confirmed');
            btn.innerHTML = '<span>✅ Sound Enabled &amp; Ready!</span>';
            btn.disabled = true;
        }
    }

    // Host clicks "Start Multiplayer Game!"
    function hostStartGame() {
        AudioFX.init();
        AudioFX.tap();
        haptic('tap');
        sendWs({ action: 'start' });
    }

    // ============================================================
    // COUNTDOWN OVERLAY
    // ============================================================
    function handleCountdown(msg) {
        mpState.status = 'STARTING';
        AudioFX.init();

        const overlay = $('mpCountdownOverlay');
        const numEl = $('mpCountdownNumber');
        const textEl = $('mpCountdownText');

        if (overlay) overlay.classList.add('active');
        if (textEl) textEl.textContent = msg.message || 'Battle Starting in...';

        let count = msg.seconds || 3;
        if (numEl) numEl.textContent = count;
        AudioFX.countdown();

        const timer = setInterval(() => {
            count--;
            if (count > 0) {
                if (numEl) numEl.textContent = count;
                AudioFX.countdown();
                haptic('tap');
            } else if (count === 0) {
                if (numEl) numEl.textContent = 'GO! 🔥';
                AudioFX.go();
                haptic('success');
            } else {
                clearInterval(timer);
                if (overlay) overlay.classList.remove('active');
            }
        }, 1000);
    }

    // ============================================================
    // ACTIVE QUESTION PHASE
    // ============================================================
    function handleQuestionActive(q) {
        mpState.status = 'QUESTION_ACTIVE';
        mpState.roundIndex = q.roundIndex;
        mpState.totalRounds = q.totalRounds;
        mpState.question = q;
        mpState.duration = q.duration || 15;
        mpState.startTime = Date.now();
        mpState.hasAnswered = false;
        mpState.myAnswerIndex = null;

        // Switch to question view
        switchArenaView('question');

        // Update Question Header
        const roundPill = $('mpQuestionRoundPill');
        if (roundPill) roundPill.textContent = `Round ${q.roundIndex} of ${q.totalRounds}`;

        const categoryPill = $('mpQuestionCategoryPill');
        if (categoryPill) categoryPill.textContent = getCategoryName(q.gameType);

        // Update Prompt & Subtitle
        const promptEl = $('mpQuestionPrompt');
        if (promptEl) promptEl.textContent = q.prompt || '';

        const subEl = $('mpQuestionSubtitle');
        if (subEl) subEl.textContent = q.subtitle || '';

        // Media Container: Audio / Video / Image / Emojis
        renderQuestionMedia(q);

        // Render 4 Filmi Option Cards
        renderOptionCards(q.options || []);

        // Real-time Answer Tracker Pill
        const trackerPill = $('mpAnswerTrackerPill');
        if (trackerPill) {
            trackerPill.textContent = `0 / ${mpState.players.filter(p => !p.isHost).length || 1} Answered`;
            trackerPill.className = 'answer-tracker-pill';
        }

        // Start Animated Timer Bar
        startQuestionTimer(mpState.duration);
    }

    function renderQuestionMedia(q) {
        const mediaContainer = $('mpQuestionMediaContainer');
        if (!mediaContainer) return;
        mediaContainer.innerHTML = '';

        // Stop any previous audio
        if (mpState.mediaAudio) {
            try {
                mpState.mediaAudio.pause();
                mpState.mediaAudio.src = '';
            } catch (e) {}
            mpState.mediaAudio = null;
        }

        if (q.mediaType === 'audio' && q.mediaUrl) {
            mediaContainer.innerHTML = `
                <div class="mp-audio-media-box">
                    <div class="audio-wave-anim">
                        <span></span><span></span><span></span><span></span><span></span>
                        <span></span><span></span><span></span><span></span><span></span>
                    </div>
                    <div class="audio-status-label">🎧 Listening to Filmi Audio Clip...</div>
                    <button type="button" class="btn-mp-replay" onclick="multiplayerClient.replayAudio()" title="Replay Clip">
                        🔄 Replay
                    </button>
                </div>
            `;
            // Play audio automatically
            try {
                const audio = new Audio(q.mediaUrl);
                mpState.mediaAudio = audio;
                audio.play().catch(err => {
                    console.log('Audio autoplay prevented, tap to play:', err);
                });
            } catch (e) {}

        } else if (q.mediaType === 'image' && q.mediaUrl) {
            mediaContainer.innerHTML = `
                <div class="mp-image-media-box">
                    <img src="${escapeHtml(q.mediaUrl)}" alt="Scene Still" class="mp-media-still-img" />
                </div>
            `;

        } else if (q.mediaType === 'video' && q.mediaUrl) {
            mediaContainer.innerHTML = `
                <div class="mp-video-media-box">
                    <video src="${escapeHtml(q.mediaUrl)}" autoplay playsinline class="mp-media-video"></video>
                </div>
            `;

        } else if (q.mediaType === 'emoji') {
            mediaContainer.innerHTML = `
                <div class="mp-emoji-media-box">
                    <div class="mp-huge-emojis">${escapeHtml(q.prompt)}</div>
                </div>
            `;
        }
    }

    function renderOptionCards(options) {
        const grid = $('mpOptionsGrid');
        if (!grid) return;

        const cardIcons = ['▲', '◆', '●', '■'];
        const cardThemes = ['card-red', 'card-blue', 'card-yellow', 'card-green'];

        grid.innerHTML = options.map((opt, i) => {
            const theme = cardThemes[i % 4];
            const icon = cardIcons[i % 4];
            return `
                <button type="button" class="mp-option-card ${theme}" id="mpOptionCard_${i}" onclick="multiplayerClient.selectOption(${i})">
                    <div class="option-icon-badge">${icon}</div>
                    <div class="option-text">${escapeHtml(opt)}</div>
                    <div class="option-selected-marker">✓ Locked</div>
                </button>
            `;
        }).join('');
    }

    function startQuestionTimer(durationSeconds) {
        clearInterval(mpState.timerInterval);

        const timerBar = $('mpTimerBarFill');
        const timerText = $('mpTimerText');
        const startTime = Date.now();
        const durationMs = durationSeconds * 1000;

        function update() {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, durationMs - elapsed);
            const remainingSec = Math.ceil(remaining / 1000);
            const pct = (remaining / durationMs) * 100;

            if (timerBar) timerBar.style.width = `${pct}%`;
            if (timerText) timerText.textContent = `${remainingSec}s`;

            if (remainingSec <= 5 && timerBar) {
                timerBar.classList.add('urgent');
            } else if (timerBar) {
                timerBar.classList.remove('urgent');
            }

            if (remaining <= 0) {
                clearInterval(mpState.timerInterval);
                if (!mpState.hasAnswered) {
                    lockAnswerInput(-1); // Timed out
                }
            }
        }

        update();
        mpState.timerInterval = setInterval(update, 100);
    }

    // Player selects an option
    function selectOption(index) {
        if (mpState.hasAnswered || mpState.status !== 'QUESTION_ACTIVE') return;

        mpState.hasAnswered = true;
        mpState.myAnswerIndex = index;
        const responseTimeMs = Date.now() - mpState.startTime;

        AudioFX.tap();
        haptic('tap');

        // Visual lock
        lockAnswerInput(index);

        // Send to server
        sendWs({
            action: 'answer',
            optionIndex: index,
            responseTimeMs: responseTimeMs
        });
    }

    function lockAnswerInput(selectedIndex) {
        document.querySelectorAll('.mp-option-card').forEach((card, idx) => {
            card.disabled = true;
            if (idx === selectedIndex) {
                card.classList.add('selected');
            } else {
                card.classList.add('dimmed');
            }
        });

        const tracker = $('mpAnswerTrackerPill');
        if (tracker) {
            tracker.textContent = '🔒 Answer Locked In! Waiting for others...';
            tracker.classList.add('self-answered');
        }
    }

    // Real-time answer indicator from server
    function handlePlayerAnswered(msg) {
        const tracker = $('mpAnswerTrackerPill');
        if (tracker && !mpState.hasAnswered) {
            tracker.textContent = `⚡ ${msg.answeredCount} / ${msg.totalCount} Players Answered`;
        }
    }

    // Replay Audio Clip
    function replayAudio() {
        if (mpState.mediaAudio) {
            try {
                mpState.mediaAudio.currentTime = 0;
                mpState.mediaAudio.play();
                haptic('tap');
            } catch (e) {}
        }
    }

    // ============================================================
    // ROUND REVEAL & LEADERBOARD PHASE
    // ============================================================
    function handleRoundReveal(data) {
        mpState.status = 'ROUND_REVEAL';
        clearInterval(mpState.timerInterval);

        // Highlight correct and wrong options
        document.querySelectorAll('.mp-option-card').forEach((card, idx) => {
            card.disabled = true;
            if (idx === data.correctIndex) {
                card.classList.add('is-correct');
                card.classList.remove('dimmed');
            } else if (idx === mpState.myAnswerIndex && idx !== data.correctIndex) {
                card.classList.add('is-wrong');
            } else {
                card.classList.add('dimmed');
            }
        });

        // Personal Result for this round
        const myResult = data.playerResults ? data.playerResults[mpState.token] : null;
        if (myResult) {
            if (myResult.isCorrect) {
                AudioFX.correct();
                haptic('success');
            } else {
                AudioFX.wrong();
                haptic('error');
            }
        }

        // Show Reveal View with Leaderboard
        setTimeout(() => {
            if (mpState.status === 'ROUND_REVEAL') {
                showRoundRevealView(data, myResult);
            }
        }, 1200);
    }

    function showRoundRevealView(data, myResult) {
        switchArenaView('reveal');

        // Result Banner
        const banner = $('mpRevealResultBanner');
        if (banner) {
            if (myResult && myResult.isCorrect) {
                banner.className = 'mp-reveal-banner result-correct';
                banner.innerHTML = `
                    <div class="result-badge">🎉 SAHI JAWAB!</div>
                    <div class="result-points">+${myResult.pointsEarned.toLocaleString()} Pts</div>
                    ${myResult.streak > 1 ? `<div class="result-streak">🔥 ${myResult.streak} Streak Bonus!</div>` : ''}
                `;
            } else if (mpState.isHost) {
                banner.className = 'mp-reveal-banner result-neutral';
                banner.innerHTML = `
                    <div class="result-badge">🎬 CORRECT ANSWER:</div>
                    <div class="result-points">${escapeHtml(data.correctAnswer || '')}</div>
                `;
            } else {
                banner.className = 'mp-reveal-banner result-wrong';
                banner.innerHTML = `
                    <div class="result-badge">💔 OOPS! GALAT JAWAB</div>
                    <div class="result-points">The answer was: <strong>${escapeHtml(data.correctAnswer || '')}</strong></div>
                `;
            }
        }

        // Trivia & Full Quote
        const triviaEl = $('mpRevealTrivia');
        if (triviaEl) {
            triviaEl.textContent = data.reveal ? `"${data.reveal}"` : (data.trivia || '');
        }

        // Live Leaderboard Roster
        renderLeaderboard(data.leaderboard || []);
    }

    function renderLeaderboard(leaderboard) {
        const container = $('mpLiveLeaderboardList');
        if (!container) return;

        container.innerHTML = leaderboard.map((p, idx) => {
            const isMe = (p.token === mpState.token);
            const rankBadges = ['🥇', '🥈', '🥉'];
            const rankDisplay = rankBadges[idx] || `#${idx + 1}`;

            return `
                <div class="mp-lb-row ${isMe ? 'is-me' : ''}">
                    <div class="lb-rank">${rankDisplay}</div>
                    <div class="lb-avatar">${p.avatar || '🎭'}</div>
                    <div class="lb-name">
                        ${escapeHtml(p.name)} ${isMe ? '<span class="tag-you">(You)</span>' : ''}
                        ${p.streak > 1 ? `<span class="streak-flame">🔥${p.streak}</span>` : ''}
                    </div>
                    <div class="lb-delta">${p.lastPoints > 0 ? `+${p.lastPoints}` : ''}</div>
                    <div class="lb-score">${p.score.toLocaleString()}</div>
                </div>
            `;
        }).join('');
    }

    // ============================================================
    // GAME OVER & GRAND FINALE PODIUM
    // ============================================================
    function handleGameOver(data) {
        mpState.status = 'GAME_OVER';
        clearInterval(mpState.timerInterval);
        AudioFX.fanfare();
        haptic('success');

        switchArenaView('podium');

        // Confetti Blast
        if (typeof window.triggerConfetti === 'function') {
            window.triggerConfetti();
        }

        const podium = data.podium || [];
        const first = podium[0];
        const second = podium[1];
        const third = podium[2];

        // 1st Place Pedestal
        const p1 = $('podium1st');
        if (p1 && first) {
            p1.innerHTML = `
                <div class="crown">👑</div>
                <div class="podium-avatar">${first.avatar || '🕺'}</div>
                <div class="podium-name">${escapeHtml(first.name)}</div>
                <div class="podium-score">${first.score.toLocaleString()} Pts</div>
                <div class="podium-pillar pillar-1">1st 🥇</div>
            `;
        }

        // 2nd Place Pedestal
        const p2 = $('podium2nd');
        if (p2 && second) {
            p2.innerHTML = `
                <div class="podium-avatar">${second.avatar || '💃'}</div>
                <div class="podium-name">${escapeHtml(second.name)}</div>
                <div class="podium-score">${second.score.toLocaleString()} Pts</div>
                <div class="podium-pillar pillar-2">2nd 🥈</div>
            `;
        } else if (p2) { p2.innerHTML = ''; }

        // 3rd Place Pedestal
        const p3 = $('podium3rd');
        if (p3 && third) {
            p3.innerHTML = `
                <div class="podium-avatar">${third.avatar || '🕶️'}</div>
                <div class="podium-name">${escapeHtml(third.name)}</div>
                <div class="podium-score">${third.score.toLocaleString()} Pts</div>
                <div class="podium-pillar pillar-3">3rd 🥉</div>
            `;
        } else if (p3) { p3.innerHTML = ''; }

        // Awards list
        const awardsBox = $('mpAwardsContainer');
        if (awardsBox && data.awards) {
            awardsBox.innerHTML = data.awards.map(a => `
                <div class="mp-award-card">
                    <div class="award-icon">${a.avatar || '🎖️'}</div>
                    <div class="award-info">
                        <div class="award-title">${escapeHtml(a.title)}</div>
                        <div class="award-winner">Awarded to: <strong>${escapeHtml(a.playerName)}</strong></div>
                        <div class="award-desc">${escapeHtml(a.desc)}</div>
                    </div>
                </div>
            `).join('');
        }
    }

    // ============================================================
    // FLOATING EMOJI SHOUTOUTS
    // ============================================================
    function sendShout(emoji) {
        AudioFX.tap();
        haptic('tap');
        sendWs({ action: 'chat', shout: emoji });
    }

    function showFloatingShout(msg) {
        const container = $('mpFloatingShoutContainer');
        if (!container) return;

        const bubble = document.createElement('div');
        bubble.className = 'mp-floating-bubble';
        bubble.innerHTML = `
            <span class="bubble-avatar">${msg.avatar || '👤'}</span>
            <span class="bubble-name">${escapeHtml(msg.playerName)}:</span>
            <span class="bubble-emoji">${escapeHtml(msg.shout)}</span>
        `;
        
        // Random horizontal position (15% to 80%)
        const leftPct = 15 + Math.random() * 65;
        bubble.style.left = `${leftPct}%`;
        
        container.appendChild(bubble);
        setTimeout(() => {
            if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
        }, 2800);
    }

    // ============================================================
    // HOST ROOM CREATION & SHARING DIALOGS
    // ============================================================
    function openCreateModal() {
        const modal = $('multiplayerCreateModal');
        if (modal) modal.classList.add('active');
    }

    function hideCreateModal() {
        const modal = $('multiplayerCreateModal');
        if (modal) modal.classList.remove('active');
    }

    function selectRoundPill(num) {
        AudioFX.tap();
        haptic('tap');
        document.querySelectorAll('.mp-round-pill').forEach(pill => {
            if (parseInt(pill.dataset.rounds, 10) === num) {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }
        });
        const inp = $('mpCreateRoundsSelect');
        if (inp) inp.value = num;
    }

    function addPlayerInputRow() {
        const container = $('mpPlayerInputsContainer');
        if (!container) return;
        const currentCount = container.querySelectorAll('.mp-player-row').length;
        if (currentCount >= 10) {
            alert('A maximum of 10 players is supported for optimal real-time experience.');
            return;
        }

        AudioFX.tap();
        haptic('tap');
        const avatars = ['💃', '🕶️', '👑', '🎸', '🦁', '🎭', '🍿', '🚀', '💎', '🤠'];
        const avatar = avatars[currentCount % avatars.length];

        const newRow = document.createElement('div');
        newRow.className = 'mp-player-row';
        newRow.innerHTML = `
            <span class="mp-avatar-pill">${avatar}</span>
            <div class="mp-input-wrap">
                <input type="text" class="form-input mp-player-name-input" placeholder="Player ${currentCount + 1} Name (e.g. Simran)" />
            </div>
            <button type="button" class="btn-remove-player" onclick="multiplayerClient.removePlayerRow(this)" title="Remove Player">&times;</button>
        `;
        container.appendChild(newRow);

        const input = newRow.querySelector('input');
        if (input) input.focus();
    }

    function removePlayerRow(btn) {
        AudioFX.tap();
        haptic('tap');
        const row = btn.closest('.mp-player-row');
        if (row) row.remove();
    }

    function copyRoomCode() {
        const code = $('mpShareRoomCode') ? $('mpShareRoomCode').textContent.trim() : '';
        if (code) {
            copyToClipboard(code, $('btnCopyRoomCode'));
        }
    }

    async function submitCreateRoom() {
        // Collect player names
        const nameInputs = document.querySelectorAll('.mp-player-name-input');
        const playerNames = [];
        nameInputs.forEach((inp, idx) => {
            const val = inp.value.trim();
            playerNames.push(val || `Player ${idx + 1}`);
        });

        if (playerNames.length < 1) {
            alert('Please add at least 1 player name.');
            return;
        }

        const gameType = $('mpCreateGameSelect').value || 'dialogue';
        const roundCount = parseInt($('mpCreateRoundsSelect').value || '10', 10);

        const token = (window.authManager && window.authManager.token) || localStorage.getItem('bollywood_arcade_token') || localStorage.getItem('arcade_session_token');
        if (!token) {
            alert('Please sign in with your mobile number to host a multiplayer room.');
            if (window.authManager) window.authManager.showAuthModal(() => submitCreateRoom());
            return;
        }

        const submitBtn = $('btnSubmitCreateRoom');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Creating Room... ⏳</span>';
        }

        try {
            const res = await fetch('/api/multiplayer/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    gameType: gameType,
                    roundCount: roundCount,
                    playerNames: playerNames
                })
            });

            const data = await res.json();
            if (data.status === 'success' && data.data) {
                hideCreateModal();
                showShareModal(data.data);
            } else {
                alert(data.message || 'Failed to create room.');
            }
        } catch (err) {
            alert('Error creating room. Check connection.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span>🚀 Generate Game Room &amp; Links</span>';
            }
        }
    }

    function showShareModal(roomData) {
        const modal = $('multiplayerShareModal');
        if (!modal) return;
        modal.classList.add('active');

        // Room Code
        const codeEl = $('mpShareRoomCode');
        if (codeEl) codeEl.textContent = roomData.roomCode;

        // Player links container
        const listContainer = $('mpShareLinksList');
        if (listContainer) {
            listContainer.innerHTML = roomData.playerLinks.map(p => {
                const encodedUrl = encodeURIComponent(p.url);
                const waText = encodeURIComponent(`🎬 Hey ${p.name}! Join my Bollywood Online Multiplayer Quiz (Room: ${roomData.roomCode})! Tap here to play:\n${p.url}`);
                const waLink = `https://api.whatsapp.com/send?text=${waText}`;

                return `
                    <div class="mp-share-row">
                        <div class="mp-share-player-info">
                            <span class="share-avatar">${p.avatar || '🕺'}</span>
                            <div class="share-name-wrap">
                                <span class="share-name">${escapeHtml(p.name)}</span>
                                <span class="share-status-tag">Ready to invite</span>
                            </div>
                        </div>
                        <div class="mp-share-actions">
                            <a href="${waLink}" target="_blank" class="btn-share-wa" title="Share via WhatsApp">
                                <span>💬 WhatsApp</span>
                            </a>
                            <button type="button" class="btn-copy-link" onclick="multiplayerClient.copyToClipboard('${escapeJsString(p.url)}', this)">
                                <span>📋 Copy</span>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Host Enter Button
        const hostBtn = $('btnEnterRoomAsHost');
        if (hostBtn) {
            hostBtn.onclick = () => {
                window.location.href = roomData.hostLink;
            };
        }
    }

    function hideShareModal() {
        const modal = $('multiplayerShareModal');
        if (modal) modal.classList.remove('active');
    }

    function copyAllInviteLinks() {
        const rows = document.querySelectorAll('.mp-share-row');
        let fullText = `🎬 Bollywood Online Quiz Party!\n\n`;
        rows.forEach(r => {
            const name = r.querySelector('.share-name').textContent.trim();
            const copyBtn = r.querySelector('.btn-copy-link');
            // Extract URL from onclick attribute
            const match = copyBtn.getAttribute('onclick').match(/'([^']+)'/);
            if (match && match[1]) {
                fullText += `• ${name}: ${match[1]}\n`;
            }
        });
        fullText += `\nJoin on your mobile and tap 'Ready'! Let's see who is the true Bollywood King/Queen! 👑`;

        copyToClipboard(fullText, $('btnCopyAllLinks'));
    }

    function copyToClipboard(text, btnElement) {
        navigator.clipboard.writeText(text).then(() => {
            if (btnElement) {
                const orig = btnElement.textContent;
                btnElement.textContent = '✅ Copied!';
                setTimeout(() => { btnElement.textContent = orig; }, 2000);
            }
        }).catch(() => {
            prompt('Copy link:', text);
        });
    }

    // Helper to switch internal Arena views
    function switchArenaView(viewName) {
        ['lobby', 'question', 'reveal', 'podium'].forEach(v => {
            const el = $(`mpView_${v}`);
            if (el) {
                if (v === viewName) el.classList.add('active');
                else el.classList.remove('active');
            }
        });
    }

    function exitArenaToHub() {
        if (confirm('Leave multiplayer game and return to All Games Hub?')) {
            if (mpState.socket) {
                try { mpState.socket.close(); } catch (e) {}
            }
            if (mpState.mediaAudio) {
                try { mpState.mediaAudio.pause(); } catch (e) {}
            }
            window.location.href = '/';
        }
    }

    function getCategoryName(type) {
        const names = {
            dialogue: 'Filmi Dialogue',
            emoji: 'Emoji Riddle',
            lyrics: 'Literal English Lyrics',
            still: 'Movie Still Mystery',
            intro: 'Song Intro Music',
            stanza: 'Antara Challenge',
            clip: 'Video Scene Clip'
        };
        return names[type] || 'Bollywood Trivia';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeJsString(str) {
        if (!str) return '';
        return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    // Auto-init on page load
    window.addEventListener('DOMContentLoaded', init);

    // Export public methods to window
    window.multiplayerClient = {
        init,
        openCreateModal,
        hideCreateModal,
        selectRoundPill,
        addPlayerInputRow,
        removePlayerRow,
        copyRoomCode,
        submitCreateRoom,
        showShareModal,
        hideShareModal,
        copyAllInviteLinks,
        copyToClipboard,
        setPlayerReady,
        hostStartGame,
        selectOption,
        replayAudio,
        sendShout,
        exitArenaToHub
    };

})();

