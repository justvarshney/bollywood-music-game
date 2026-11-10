/* ============================================================
   BOLLYWOOD PARTY ARCADE ENGINE
   Supports:
   - 🎬 Scene Dekho (Movie Still Photo Quiz)
   - 🔤 Emoji Dhamaka (Movie Emoji Quiz)
   - 🇬🇧 Angrezi Babu, Desi Gaana (Literal English Lyrics Quiz)
   - 🗣️ Dialogue Baazi (Iconic Dialogue Quiz)
   ============================================================ */

(function () {
    'use strict';

    // ---- Mode Configurations ----
    const GAME_CONFIGS = {
        still: {
            title: 'Scene Dekho!',
            subtitle: 'Guess the movie from the iconic still photograph',
            icon: '🎬',
            dataFile: 'stills_data.json',
            countPillDefault: '10',
            badge: 'Visual Mystery'
        },
        emoji: {
            title: 'Emoji Dhamaka!',
            subtitle: 'Decipher the movie title from the emoji riddle',
            icon: '🔤',
            dataFile: 'emoji_data.json',
            countPillDefault: '10',
            badge: 'Party Favorite'
        },
        lyrics: {
            title: 'Angrezi Babu, Desi Gaana!',
            subtitle: 'Guess the Hindi song from its literal English translation',
            icon: '🇬🇧',
            dataFile: 'lyrics_data.json',
            countPillDefault: '10',
            badge: 'Laugh Out Loud'
        },
        dialogue: {
            title: 'Dialogue Baazi!',
            subtitle: 'Fill in the blank of the legendary Bollywood punchline',
            icon: '🗣️',
            dataFile: 'dialogue_data.json',
            countPillDefault: '10',
            badge: 'Filmi Dialogue'
        }
    };

    // ---- State ----
    const partyState = {
        activeMode: null, // 'still' | 'emoji' | 'lyrics' | 'dialogue'
        cache: {}, // loaded datasets
        items: [],
        currentIndex: 0,
        totalQuestions: 10,
        score: 0,
        streak: 0,
        bestStreak: 0,
        clueLevel: 0, // 0: none, 1: clue1, 2: clue2, 3: clue3
        mysteryFocusStep: 0, // 0: high blur/zoom, 1: mid, 2: low, 3: crisp
        instantCrisp: false,
        hostPeekVisible: false,
        status: 'active', // 'active' | 'revealed'
    };

    // Helper DOM lookup
    const $ = (id) => document.getElementById(id);

    // ---- Haptic Feedback Helper ----
    function partyHaptic(type = 'tap') {
        if (!navigator.vibrate) return;
        try {
            if (type === 'tap') navigator.vibrate(12);
            else if (type === 'success') navigator.vibrate([25, 40, 25]);
            else if (type === 'skip') navigator.vibrate(18);
        } catch (e) {}
    }

    // ---- Universal Screen Switcher ----
    function showAppScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const target = $(screenId);
        if (target) {
            target.classList.add('active');
            target.scrollTop = 0;
        }
        
        // If navigating away from music game, stop any playing music
        if (screenId !== 'gameScreen' && typeof window.stopMusicForParty === 'function') {
            window.stopMusicForParty();
        }
    }

    // Expose openGameHub globally
    window.openGameHub = function () {
        if (typeof window.stopMusicForParty === 'function') {
            window.stopMusicForParty();
        }
        showAppScreen('hubScreen');
        triggerParticles();
    };

    // Expose openMusicGame globally if not provided by game.js
    if (!window.openMusicGame) {
        window.openMusicGame = function (mode = 'intro') {
            showAppScreen('startScreen');
        };
    }

    // ---- Launch Party Game Config Screen ----
    window.selectPartyGame = function (mode) {
        if (!GAME_CONFIGS[mode]) return;
        partyState.activeMode = mode;
        const cfg = GAME_CONFIGS[mode];

        $('partyStartTitle').textContent = cfg.title;
        $('partyStartSubtitle').textContent = cfg.subtitle;
        $('partyStartIcon').textContent = cfg.icon;
        $('partyStartBadge').textContent = cfg.badge;

        // Custom options per game mode
        const stillOptions = $('partyStillOptions');
        if (stillOptions) {
            stillOptions.classList.toggle('hidden', mode !== 'still');
        }

        const lyricsOptions = $('partyLyricsOptions');
        if (lyricsOptions) {
            lyricsOptions.classList.toggle('hidden', mode !== 'lyrics');
        }

        // Set default pill count
        const pills = document.querySelectorAll('#partyCountPills .count-pill');
        pills.forEach(p => {
            p.classList.toggle('active', p.getAttribute('data-count') === cfg.countPillDefault);
        });

        partyHaptic('tap');
        showAppScreen('partyStartScreen');
    };

    // ---- Setup Pill Selection ----
    function setupPartyPills() {
        const container = $('partyCountPills');
        if (!container) return;
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.count-pill');
            if (!btn) return;
            container.querySelectorAll('.count-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            partyHaptic('tap');
        });
    }

    // ---- Start Party Game ----
    window.startPartyGame = async function () {
        const mode = partyState.activeMode;
        if (!mode || !GAME_CONFIGS[mode]) return;

        const cfg = GAME_CONFIGS[mode];

        // Read selected question count
        const activePill = document.querySelector('#partyCountPills .count-pill.active');
        const countVal = activePill ? activePill.getAttribute('data-count') : '10';

        // Check options
        const crispToggle = $('toggleInstantCrisp');
        partyState.instantCrisp = crispToggle ? crispToggle.checked : false;

        // Load data if not already cached
        if (!partyState.cache[mode]) {
            try {
                const res = await fetch(cfg.dataFile);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                partyState.cache[mode] = await res.json();
            } catch (err) {
                console.error(`Failed to load ${cfg.dataFile}:`, err);
                alert(`Could not load questions for ${cfg.title}. Please check the server.`);
                return;
            }
        }

        const rawData = partyState.cache[mode];
        if (!Array.isArray(rawData) || rawData.length === 0) {
            alert('No questions found for this game mode.');
            return;
        }

        // Shuffle questions
        const shuffled = [...rawData].sort(() => Math.random() - 0.5);
        let count = countVal === 'all' ? shuffled.length : parseInt(countVal, 10);
        count = Math.min(count, shuffled.length);

        partyState.items = shuffled.slice(0, count);
        partyState.totalQuestions = partyState.items.length;
        partyState.currentIndex = 0;
        partyState.score = 0;
        partyState.streak = 0;
        partyState.bestStreak = 0;

        partyHaptic('tap');
        showAppScreen('partyGameScreen');
        loadCurrentQuestion();
    };

    // ---- Load Question ----
    function loadCurrentQuestion() {
        const item = partyState.items[partyState.currentIndex];
        if (!item) {
            finishPartyGame();
            return;
        }

        partyState.status = 'active';
        partyState.clueLevel = 0;
        partyState.mysteryFocusStep = partyState.instantCrisp ? 3 : 0;
        partyState.hostPeekVisible = false;

        // Header Updates
        $('partyProgressText').textContent = `${GAME_CONFIGS[partyState.activeMode].icon} ${partyState.currentIndex + 1} / ${partyState.totalQuestions}`;
        $('partyScoreValue').textContent = partyState.score;
        $('partyStreakValue').textContent = `${partyState.streak} 🔥`;

        const progressPercent = ((partyState.currentIndex) / partyState.totalQuestions) * 100;
        $('partyProgressBar').style.width = `${progressPercent}%`;

        // Reset Host Peek Box
        hidePartyPeek();

        // Render Mode Stage
        renderQuestionStage(item);

        // Reset Action Dock to Active State
        updatePartyDockState('active');
    }

    // ---- Render Game Stage According to Mode ----
    function renderQuestionStage(item) {
        const mode = partyState.activeMode;
        const stage = $('partyStageArea');
        if (!stage) return;

        let html = '';

        if (mode === 'still') {
            const blurClass = getBlurClass(partyState.mysteryFocusStep);
            html = `
                <div class="still-game-stage">
                    <div class="still-image-frame ${blurClass}" id="stillImageFrame">
                        <img src="${item.image}" alt="Movie Still" class="still-photo" id="stillPhoto"
                             onerror="this.onerror=null; this.src='stills/Dilwale Dulhania Le Jayenge.svg';">
                        <div class="mystery-lens-overlay" id="mysteryLensOverlay">
                            <span class="lens-badge">${getMysteryBadgeText(partyState.mysteryFocusStep)}</span>
                        </div>
                    </div>

                    <div class="still-controls-row">
                        <button type="button" class="btn-party-sub btn-sharpen" onclick="sharpenStillImage()" id="btnSharpen">
                            <span class="btn-sub-icon">🔍</span>
                            <span class="btn-sub-label">Sharpen Focus (${partyState.mysteryFocusStep}/3)</span>
                            <kbd class="kbd-badge-sub">F</kbd>
                        </button>
                        <button type="button" class="btn-party-sub btn-clue" onclick="showNextPartyClue()" id="btnClue">
                            <span class="btn-sub-icon">💡</span>
                            <span class="btn-sub-label">Show Clue (<span id="clueCounterText">0</span>/3)</span>
                            <kbd class="kbd-badge-sub">H</kbd>
                        </button>
                    </div>

                    <div class="party-clues-box" id="partyCluesBox"></div>
                </div>
            `;
        } else if (mode === 'emoji') {
            html = `
                <div class="emoji-game-stage">
                    <div class="emoji-banner-card">
                        <div class="emoji-display" id="emojiDisplay">${item.emojis}</div>
                        <p class="emoji-caption">Which Bollywood movie is this?</p>
                    </div>

                    <div class="still-controls-row">
                        <button type="button" class="btn-party-sub btn-clue" onclick="showNextPartyClue()" id="btnClue">
                            <span class="btn-sub-icon">💡</span>
                            <span class="btn-sub-label">Show Clue (<span id="clueCounterText">0</span>/2)</span>
                            <kbd class="kbd-badge-sub">H</kbd>
                        </button>
                    </div>

                    <div class="party-clues-box" id="partyCluesBox"></div>
                </div>
            `;
        } else if (mode === 'lyrics') {
            html = `
                <div class="lyrics-game-stage">
                    <div class="lyrics-parchment-card">
                        <div class="lyrics-quote-icon">📜</div>
                        <div class="lyrics-english-text" id="lyricsEnglishText">${escapeHtml(item.englishVerse)}</div>
                        <p class="lyrics-caption">Guess the famous Hindi song!</p>
                    </div>

                    <div class="still-controls-row">
                        <button type="button" class="btn-party-sub btn-speak" onclick="speakLyricsAloud()" id="btnSpeak">
                            <span class="btn-sub-icon">🔊</span>
                            <span class="btn-sub-label">Recite Verse</span>
                            <kbd class="kbd-badge-sub">S</kbd>
                        </button>
                        <button type="button" class="btn-party-sub btn-clue" onclick="showNextPartyClue()" id="btnClue">
                            <span class="btn-sub-icon">💡</span>
                            <span class="btn-sub-label">Show Clue (<span id="clueCounterText">0</span>/2)</span>
                            <kbd class="kbd-badge-sub">H</kbd>
                        </button>
                    </div>

                    <div class="party-clues-box" id="partyCluesBox"></div>
                </div>
            `;
        } else if (mode === 'dialogue') {
            const promptWithBlank = item.prompt.replace('______', '<span class="dialogue-blank" id="dialogueBlankWord">? ? ? ?</span>');
            html = `
                <div class="dialogue-game-stage">
                    <div class="dialogue-quote-card">
                        <div class="dialogue-marks">“</div>
                        <div class="dialogue-text">${promptWithBlank}</div>
                        <div class="dialogue-character-tag">${escapeHtml(item.character)}</div>
                    </div>

                    <div class="still-controls-row">
                        <button type="button" class="btn-party-sub btn-clue" onclick="showNextPartyClue()" id="btnClue">
                            <span class="btn-sub-icon">💡</span>
                            <span class="btn-sub-label">Show Clue (<span id="clueCounterText">0</span>/2)</span>
                            <kbd class="kbd-badge-sub">H</kbd>
                        </button>
                    </div>

                    <div class="party-clues-box" id="partyCluesBox"></div>
                </div>
            `;
        }

        stage.innerHTML = html;
        updatePartyCluesDisplay();
    }

    // Helper for mystery lens steps
    function getBlurClass(step) {
        if (step === 0) return 'focus-level-0'; // high blur + zoom
        if (step === 1) return 'focus-level-1'; // mid blur
        if (step === 2) return 'focus-level-2'; // slight blur
        return 'focus-level-crisp';            // completely crisp
    }

    function getMysteryBadgeText(step) {
        if (step === 0) return '🔍 Level 1: Mystery Lens';
        if (step === 1) return '🔍 Level 2: Narrow Focus';
        if (step === 2) return '🔍 Level 3: Almost Clear';
        return '✨ Level 4: Full Crisp';
    }

    // ---- Sharpen Still Image Action ----
    window.sharpenStillImage = function () {
        if (partyState.activeMode !== 'still') return;
        if (partyState.mysteryFocusStep < 3) {
            partyState.mysteryFocusStep++;
            partyHaptic('tap');
            const frame = $('stillImageFrame');
            if (frame) {
                frame.className = `still-image-frame ${getBlurClass(partyState.mysteryFocusStep)}`;
                const badge = frame.querySelector('.lens-badge');
                if (badge) badge.textContent = getMysteryBadgeText(partyState.mysteryFocusStep);
            }
            const btnSharpen = $('btnSharpen');
            if (btnSharpen) {
                btnSharpen.querySelector('.btn-sub-label').textContent = `Sharpen Focus (${partyState.mysteryFocusStep}/3)`;
            }
        }
    };

    // ---- Progressive Clue Action ----
    window.showNextPartyClue = function () {
        const maxClues = partyState.activeMode === 'still' ? 3 : 2;
        if (partyState.clueLevel < maxClues) {
            partyState.clueLevel++;
            partyHaptic('tap');
            updatePartyCluesDisplay();
        }
    };

    function updatePartyCluesDisplay() {
        const item = partyState.items[partyState.currentIndex];
        const box = $('partyCluesBox');
        if (!box || !item) return;

        const maxClues = partyState.activeMode === 'still' ? 3 : 2;
        const counter = $('clueCounterText');
        if (counter) counter.textContent = partyState.clueLevel;

        const clues = [];
        if (partyState.clueLevel >= 1 && item.clue1) clues.push({ num: 1, text: item.clue1, icon: '📅' });
        if (partyState.clueLevel >= 2 && item.clue2) clues.push({ num: 2, text: item.clue2, icon: '🌟' });
        if (partyState.clueLevel >= 3 && item.clue3) clues.push({ num: 3, text: item.clue3, icon: '🎬' });

        if (clues.length === 0) {
            box.innerHTML = '';
            box.classList.remove('has-clues');
            return;
        }

        box.classList.add('has-clues');
        box.innerHTML = clues.map(c => `
            <div class="party-clue-pill animate-fade-in">
                <span class="clue-badge">${c.icon} Hint ${c.num}</span>
                <span class="clue-content">${escapeHtml(c.text)}</span>
            </div>
        `).join('');
    }

    // ---- Recite Lyrics Aloud via Web Speech API ----
    window.speakLyricsAloud = function () {
        const item = partyState.items[partyState.currentIndex];
        if (!item || !window.speechSynthesis) return;

        window.speechSynthesis.cancel(); // Stop any pending speech
        const utterance = new SpeechSynthesisUtterance(item.englishVerse);
        utterance.rate = 0.9;
        utterance.pitch = 1.05;

        // Try to pick a distinguished English voice
        const voices = window.speechSynthesis.getVoices();
        const britishOrIndianVoice = voices.find(v => v.lang.includes('en-GB') || v.lang.includes('en-IN') || v.lang.includes('en-US'));
        if (britishOrIndianVoice) {
            utterance.voice = britishOrIndianVoice;
        }

        partyHaptic('tap');
        const btn = $('btnSpeak');
        if (btn) btn.classList.add('speaking-active');

        utterance.onend = () => {
            if (btn) btn.classList.remove('speaking-active');
        };

        window.speechSynthesis.speak(utterance);
    };

    // ---- Host Peek Toggle ----
    window.togglePartyPeek = function () {
        partyState.hostPeekVisible = !partyState.hostPeekVisible;
        partyHaptic('tap');
        if (partyState.hostPeekVisible) {
            showPartyPeek();
        } else {
            hidePartyPeek();
        }
    };

    function showPartyPeek() {
        const item = partyState.items[partyState.currentIndex];
        const box = $('partyPeekResult');
        const label = $('partyPeekLabel');
        if (!box || !item) return;

        let answerText = item.movie;
        if (partyState.activeMode === 'lyrics') {
            answerText = `${item.hindiTitle} (${item.movie})`;
        } else if (partyState.activeMode === 'dialogue') {
            answerText = `Missing: "${item.missingWord}" • ${item.movie}`;
        }

        box.textContent = answerText;
        box.classList.remove('hidden');
        if (label) label.textContent = 'Hide Answer';
    }

    function hidePartyPeek() {
        partyState.hostPeekVisible = false;
        const box = $('partyPeekResult');
        const label = $('partyPeekLabel');
        if (box) box.classList.add('hidden');
        if (label) label.textContent = 'Peek Answer (Host)';
    }

    // ---- Action Dock Controls ----
    function updatePartyDockState(phase) {
        const activeDock = $('partyDockActive');
        const revealDock = $('partyDockRevealed');
        if (activeDock && revealDock) {
            activeDock.classList.toggle('active', phase === 'active');
            revealDock.classList.toggle('active', phase === 'revealed');
        }
    }

    // Mark Correct (Room guessed it!)
    window.markPartyCorrect = function () {
        if (partyState.status !== 'active') return;
        partyState.status = 'revealed';
        partyState.score++;
        partyState.streak++;
        if (partyState.streak > partyState.bestStreak) {
            partyState.bestStreak = partyState.streak;
        }

        $('partyScoreValue').textContent = partyState.score;
        $('partyStreakValue').textContent = `${partyState.streak} 🔥`;

        partyHaptic('success');
        if (typeof window.triggerConfetti === 'function') {
            window.triggerConfetti();
        }

        revealCurrentAnswer(true);
    };

    // Skip question
    window.skipPartyQuestion = function () {
        if (partyState.status !== 'active') return;
        partyState.status = 'revealed';
        partyState.streak = 0;
        $('partyStreakValue').textContent = `${partyState.streak} 🔥`;

        partyHaptic('skip');
        revealCurrentAnswer(false);
    };

    // ---- Reveal Current Answer Card ----
    function revealCurrentAnswer(wasGuessed) {
        const item = partyState.items[partyState.currentIndex];
        const stage = $('partyStageArea');
        if (!item || !stage) return;

        // Fully crisp still image if mode is still
        const frame = $('stillImageFrame');
        if (frame) {
            frame.className = 'still-image-frame focus-level-crisp';
            const badge = frame.querySelector('.lens-badge');
            if (badge) badge.textContent = '✨ Full Crisp Revealed';
        }

        // Fill blank if mode is dialogue
        const blank = $('dialogueBlankWord');
        if (blank && item.missingWord) {
            blank.textContent = item.missingWord;
            blank.classList.add('revealed-blank');
        }

        // Create Celebration Card
        let celebrationCard = '';
        const titleBadge = wasGuessed ? '🎉 GUESS IDENTIFIED!' : '⏭ SKIPPED';
        const badgeColor = wasGuessed ? 'badge-success' : 'badge-skip';

        if (partyState.activeMode === 'still') {
            celebrationCard = `
                <div class="party-reveal-card animate-bounce-in">
                    <div class="reveal-badge-tag ${badgeColor}">${titleBadge}</div>
                    <h2 class="reveal-title">${escapeHtml(item.movie)}</h2>
                    <div class="reveal-meta-row">
                        <span class="meta-tag">📅 ${item.year}</span>
                        <span class="meta-tag">🎬 ${escapeHtml(item.director)}</span>
                    </div>
                    <p class="reveal-cast"><strong>Starring:</strong> ${escapeHtml(item.leadCast)}</p>
                    <blockquote class="reveal-dialogue">“${escapeHtml(item.iconicDialogue)}”</blockquote>
                </div>
            `;
        } else if (partyState.activeMode === 'emoji') {
            celebrationCard = `
                <div class="party-reveal-card animate-bounce-in">
                    <div class="reveal-badge-tag ${badgeColor}">${titleBadge}</div>
                    <div class="reveal-emojis">${item.emojis}</div>
                    <h2 class="reveal-title">${escapeHtml(item.movie)}</h2>
                    <div class="reveal-meta-row">
                        <span class="meta-tag">📅 ${item.year}</span>
                    </div>
                    <p class="reveal-cast"><strong>Starring:</strong> ${escapeHtml(item.leadCast)}</p>
                    <p class="reveal-trivia">💡 <em>${escapeHtml(item.trivia)}</em></p>
                </div>
            `;
        } else if (partyState.activeMode === 'lyrics') {
            celebrationCard = `
                <div class="party-reveal-card animate-bounce-in">
                    <div class="reveal-badge-tag ${badgeColor}">${titleBadge}</div>
                    <h2 class="reveal-title">🎵 ${escapeHtml(item.hindiTitle)}</h2>
                    <p class="reveal-submovie">Film: <strong>${escapeHtml(item.movie)}</strong> (${item.year})</p>
                    <div class="reveal-meta-row">
                        <span class="meta-tag">🎤 ${escapeHtml(item.singer)}</span>
                        <span class="meta-tag">🎼 ${escapeHtml(item.musicDirector)}</span>
                    </div>
                    <div class="reveal-hindi-box">
                        <span class="hindi-tag">Original Hindi Lyrics</span>
                        <p class="hindi-lyrics-text">${escapeHtml(item.originalLyrics)}</p>
                    </div>
                </div>
            `;
        } else if (partyState.activeMode === 'dialogue') {
            celebrationCard = `
                <div class="party-reveal-card animate-bounce-in">
                    <div class="reveal-badge-tag ${badgeColor}">${titleBadge}</div>
                    <div class="reveal-punchline-highlight">Missing Word: <strong>${escapeHtml(item.missingWord)}</strong></div>
                    <blockquote class="reveal-fullquote">“${escapeHtml(item.fullQuote)}”</blockquote>
                    <h3 class="reveal-title">${escapeHtml(item.movie)} (${item.year})</h3>
                    <p class="reveal-cast">Character: <strong>${escapeHtml(item.character)}</strong> (Played by ${escapeHtml(item.actor)})</p>
                </div>
            `;
        }

        // Append reveal card to stage
        const existingCard = stage.querySelector('.party-reveal-card');
        if (existingCard) existingCard.remove();

        const wrap = document.createElement('div');
        wrap.innerHTML = celebrationCard;
        stage.appendChild(wrap.firstElementChild);

        updatePartyDockState('revealed');
    }

    // Next Question
    window.nextPartyQuestion = function () {
        partyHaptic('tap');
        partyState.currentIndex++;
        if (partyState.currentIndex >= partyState.totalQuestions) {
            finishPartyGame();
        } else {
            loadCurrentQuestion();
        }
    };

    // ---- Finish Game & Results ----
    function finishPartyGame() {
        const accuracy = partyState.totalQuestions > 0 ? Math.round((partyState.score / partyState.totalQuestions) * 100) : 0;

        $('partyFinalScore').textContent = partyState.score;
        $('partyTotalQuestions').textContent = partyState.totalQuestions;
        $('partyBestStreak').textContent = partyState.bestStreak;
        $('partyAccuracy').textContent = `${accuracy}%`;

        // Personality Grade
        let grade = '';
        if (accuracy === 100) {
            grade = '👑 असली फ़िल्मी भगवान! (Absolute Bollywood Legend)';
        } else if (accuracy >= 80) {
            grade = '🌟 सुपर डुपर हिट! (Certified Film Buff)';
        } else if (accuracy >= 50) {
            grade = '🍿 टाइमपास शौकीन! (Popcorn Movie Fan)';
        } else {
            grade = '🎬 अगली फ़िल्म ज़रूर देखना! (Time for a Movie Marathon)';
        }
        $('partyResultsGrade').textContent = grade;

        if (typeof window.triggerConfetti === 'function' && accuracy >= 50) {
            window.triggerConfetti();
        }

        showAppScreen('partyResultsScreen');
    }

    // Replay same party game
    window.replayCurrentPartyGame = function () {
        if (partyState.activeMode) {
            window.selectPartyGame(partyState.activeMode);
        } else {
            window.openGameHub();
        }
    };

    // Confirm exit party game
    window.confirmExitPartyGame = function () {
        if (confirm('Exit game and return to Bollywood Party Hub?')) {
            partyHaptic('tap');
            window.openGameHub();
        }
    };

    // ---- Keyboard Shortcut Listener ----
    window.addEventListener('keydown', (e) => {
        // Only active when partyGameScreen is open
        const partyScreen = $('partyGameScreen');
        if (!partyScreen || !partyScreen.classList.contains('active')) return;

        // Ignore inputs
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        const key = e.key.toLowerCase();

        // Guessed / Correct: Y or Enter
        if (key === 'y' || (key === 'enter' && partyState.status === 'active')) {
            e.preventDefault();
            window.markPartyCorrect();
        }
        // Next: Space or Enter when revealed
        else if ((key === ' ' || key === 'arrowright' || key === 'enter') && partyState.status === 'revealed') {
            e.preventDefault();
            window.nextPartyQuestion();
        }
        // Skip: Space or ArrowRight when active
        else if ((key === ' ' || key === 'arrowright') && partyState.status === 'active') {
            e.preventDefault();
            window.skipPartyQuestion();
        }
        // Clue: H
        else if (key === 'h' && partyState.status === 'active') {
            e.preventDefault();
            window.showNextPartyClue();
        }
        // Sharpen Focus: F
        else if (key === 'f' && partyState.activeMode === 'still') {
            e.preventDefault();
            window.sharpenStillImage();
        }
        // Peek Host: P
        else if (key === 'p' && partyState.status === 'active') {
            e.preventDefault();
            window.togglePartyPeek();
        }
        // Speak Lyrics: S
        else if (key === 's' && partyState.activeMode === 'lyrics') {
            e.preventDefault();
            window.speakLyricsAloud();
        }
        // Exit: Escape
        else if (key === 'escape') {
            e.preventDefault();
            window.confirmExitPartyGame();
        }
    });

    // Particle background trigger
    function triggerParticles() {
        if (typeof window.initParticles === 'function') {
            window.initParticles();
        }
    }

    // Helper to sanitize strings
    function escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    // Initialize on DOM load
    document.addEventListener('DOMContentLoaded', () => {
        setupPartyPills();
    });

})();
