/* ===========================
   BOLLYWOOD 90's MUSIC QUIZ
   Mobile-First Game Engine v4
   
   Features:
   - Touch & Mobile First Thumb Zone Docks
   - Dynamic Viewport Scaling & Retina Canvas Visualizer
   - Host Peek & Song Reveal
   - Haptic Feedback & Tap-to-Pause Vinyl
   - Full Hybrid Keyboard Shortcut Support
   =========================== */

// ---- Configuration ----
const SONGS_DATA_URL = 'songs_data.json';

// ---- State ----
let allSongsData = [];

let gameState = {
    currentSongIndex: 0,
    totalSongs: 10,
    score: 0,
    streak: 0,
    bestStreak: 0,
    phase: 'idle', // 'playing', 'guessing', 'celebrating', 'replaying', 'transitioning'
    songOrder: [],
    timerInterval: null,
    timeRemaining: 0,
    audioContext: null,
    analyser: null,
    audioSourceNode: null,
    sharedAudio: null,
    animFrameId: null,
    currentAudio: null,
    currentSongData: null,
};

// ---- DOM References ----
const $ = (id) => document.getElementById(id);
const startScreen = $('startScreen');
const gameScreen = $('gameScreen');
const resultsScreen = $('resultsScreen');

// ---- Haptic Feedback Helper ----
function triggerHaptic(type = 'tap') {
    if (!navigator.vibrate) return;
    try {
        if (type === 'tap') {
            navigator.vibrate(12);
        } else if (type === 'success') {
            navigator.vibrate([25, 40, 25]);
        } else if (type === 'skip') {
            navigator.vibrate(18);
        }
    } catch (e) {
        // Ignore haptic errors on unsupported devices
    }
}

// ---- Load Songs Data ----
async function loadSongsData() {
    try {
        const resp = await fetch(SONGS_DATA_URL);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        allSongsData = await resp.json();
        console.log(`✅ Loaded ${allSongsData.length} songs from songs_data.json`);
        updateSongCountOptions();
        $('startBtn').disabled = false;
        $('startBtn').querySelector('.btn-text').textContent = '🎶 Start Quiz';
    } catch (e) {
        console.error('Failed to load songs_data.json:', e);
        $('startBtn').querySelector('.btn-text').textContent = '⚠️ No Songs Found';
        $('startBtn').disabled = true;
        const hint = document.createElement('p');
        hint.className = 'start-hint';
        hint.style.color = '#ff6b9d';
        hint.innerHTML = 'Run <kbd>python3 prepare.py</kbd> first to prepare songs';
        $('startBtn').parentNode.insertBefore(hint, $('startBtn').nextSibling);
    }
}

// ---- Song Count Pills & Selector ----
function updateSongCountOptions() {
    const total = allSongsData.length;
    const select = $('songCount');
    select.innerHTML = '';
    
    const countOptions = [5, 10, 20, 30].filter(n => n < total);
    if (!countOptions.includes(total)) countOptions.push(total);

    countOptions.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n === total ? `All ${total} Songs` : `${n} Songs`;
        if (n === Math.min(10, total)) opt.selected = true;
        select.appendChild(opt);
    });

    // Setup pill buttons
    const pillsContainer = $('songCountPills');
    pillsContainer.innerHTML = '';

    const pillValues = [5, 10, 20, 30].filter(n => n <= total);
    if (!pillValues.includes(total)) pillValues.push('all');

    pillValues.forEach(val => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'count-pill';
        btn.dataset.count = val;
        btn.textContent = val === 'all' ? `All (${total})` : val;
        
        const isDefault = (val === 10 || (val === total && total < 10));
        if (isDefault) btn.classList.add('active');

        btn.addEventListener('click', () => {
            triggerHaptic('tap');
            document.querySelectorAll('.count-pill').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            select.value = val === 'all' ? total : val;
        });

        pillsContainer.appendChild(btn);
    });
}

// ---- Background Particles ----
function createParticles() {
    const container = $('bgParticles');
    const colors = ['#ff6b9d', '#c44dff', '#6e4dff', '#4dc9ff', '#ffd700'];
    for (let i = 0; i < 24; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');
        const size = Math.random() * 5 + 2;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        particle.style.animationDuration = Math.random() * 15 + 10 + 's';
        particle.style.animationDelay = Math.random() * 10 + 's';
        container.appendChild(particle);
    }
}

// ---- Screen Transitions ----
function showScreen(screen) {
    [startScreen, gameScreen, resultsScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
}

// ---- Action Dock Phase Switcher ----
function setDockPhase(phaseId) {
    ['dockPlaying', 'dockGuessing', 'dockCelebrating'].forEach(id => {
        const dock = $(id);
        if (dock) {
            if (id === phaseId) {
                dock.classList.add('active');
            } else {
                dock.classList.remove('active');
            }
        }
    });
}

// ---- Shuffle Array ----
function shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// ---- Connect Audio to Web Audio API for visualizer ----
function connectVisualizer(audio) {
    try {
        if (!gameState.audioContext) {
            gameState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (gameState.audioContext.state === 'suspended') {
            gameState.audioContext.resume();
        }
        
        // Single MediaElementSourceNode per audio element (safe for iOS Safari)
        if (!gameState.audioSourceNode) {
            gameState.audioSourceNode = gameState.audioContext.createMediaElementSource(audio);
            gameState.analyser = gameState.audioContext.createAnalyser();
            gameState.analyser.fftSize = 256;
            gameState.audioSourceNode.connect(gameState.analyser);
            gameState.analyser.connect(gameState.audioContext.destination);
        }
    } catch (e) {
        console.log('Visualizer setup info:', e);
    }
}

// ---- Start Game ----
function startGame() {
    if (allSongsData.length === 0) return;
    triggerHaptic('tap');

    // Initialize & Unlock Audio Session for iOS/Safari inside the user click handler
    if (!gameState.sharedAudio) {
        gameState.sharedAudio = new Audio();
        gameState.sharedAudio.crossOrigin = "anonymous";
    }

    try {
        if (!gameState.audioContext) {
            gameState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (gameState.audioContext.state === 'suspended') {
            gameState.audioContext.resume();
        }

        // Play silent audio buffer to unlock iOS Safari Web Audio
        const buffer = gameState.audioContext.createBuffer(1, 1, 22050);
        const source = gameState.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(gameState.audioContext.destination);
        source.start(0);

        if (navigator.audioSession) {
            navigator.audioSession.type = 'playback';
        }
    } catch (e) {
        console.log('Audio Context unlock error:', e);
    }

    const count = parseInt($('songCount').value) || 10;
    gameState.totalSongs = Math.min(count, allSongsData.length);
    gameState.currentSongIndex = 0;
    gameState.score = 0;
    gameState.streak = 0;
    gameState.bestStreak = 0;
    gameState.phase = 'idle';

    const allIndices = Array.from({ length: allSongsData.length }, (_, i) => i);
    gameState.songOrder = shuffleArray(allIndices).slice(0, gameState.totalSongs);

    showScreen(gameScreen);
    resizeVisualizerCanvas();
    updateScoreDisplay();
    updateProgress();

    setTimeout(() => playSong(), 600);
}

// ---- Reset Game ----
function resetGame() {
    triggerHaptic('tap');
    gameState.phase = 'idle';
    cleanupAudio();
    showScreen(startScreen);
}

// ---- Exit Game Confirmation ----
function confirmExitGame() {
    triggerHaptic('tap');
    if (confirm('Exit quiz and return to home screen?')) {
        resetGame();
    }
}

// ======================================================
// CORE GAME FLOW
// ======================================================

// ---- Play Song: Load full song, play from start, auto-pause at intro end ----
function playSong() {
    if (gameState.currentSongIndex >= gameState.totalSongs) {
        showResults();
        return;
    }

    // Clean up any previous audio
    cleanupAudio();

    gameState.phase = 'playing';

    // Get song data
    const dataIndex = gameState.songOrder[gameState.currentSongIndex];
    const songData = allSongsData[dataIndex];
    gameState.currentSongData = songData;

    const introDuration = songData.introDuration;

    // Reset UI & Host Peek
    $('statePlaying').classList.remove('hidden');
    $('stateGuessing').classList.add('hidden');
    $('stateCelebrating').classList.add('hidden');
    $('listeningText').textContent = `🎵 Listening... (${introDuration}s)`;
    $('vinylTapHint').textContent = 'Tap to Pause';
    $('btnPausePlayingText').textContent = 'Pause';
    $('btnPausePlayingIcon').textContent = '⏸';

    resetPeekDrawer();
    setDockPhase('dockPlaying');
    updateProgress();

    // Start vinyl spinning
    $('vinylRecord').classList.add('spinning');

    // Timer setup
    gameState.timeRemaining = introDuration;
    updateTimerDisplay(introDuration);
    $('timerContainer').style.opacity = '1';

    // Reuse unlocked global audio element
    if (!gameState.sharedAudio) {
        gameState.sharedAudio = new Audio();
        gameState.sharedAudio.crossOrigin = "anonymous";
    }
    const audio = gameState.sharedAudio;
    audio.src = songData.fullFile;
    audio.load();
    audio.currentTime = 0;
    gameState.currentAudio = audio;

    // Connect Web Audio API for visualizer
    connectVisualizer(audio);
    startVisualizer();

    // Update MediaSession
    updateMediaSession("🎵 Bollywood 90's Quiz", `Song #${gameState.currentSongIndex + 1} Intro`);

    // Start playback
    audio.play().catch(e => {
        console.error('Audio play failed:', e);
    });

    // Monitor playback — auto-pause at intro boundary
    gameState.timerInterval = setInterval(() => {
        if (!audio || audio.paused) return;

        const elapsed = audio.currentTime;
        gameState.timeRemaining = Math.max(0, introDuration - elapsed);
        updateTimerDisplay(introDuration);

        // Pause right at intro end
        if (elapsed >= introDuration) {
            clearInterval(gameState.timerInterval);
            gameState.timerInterval = null;
            audio.pause();
            onIntroFinished();
        }
    }, 50);
}

// ---- Intro Finished → Pause for Guessing ----
function onIntroFinished() {
    gameState.phase = 'guessing';

    // Stop vinyl and visualizer
    $('vinylRecord').classList.remove('spinning');
    stopVisualizer();

    // Update UI
    $('statePlaying').classList.add('hidden');
    $('stateGuessing').classList.remove('hidden');
    $('stateCelebrating').classList.add('hidden');
    $('timerContainer').style.opacity = '0.35';
    $('timerText').textContent = '⏸';
    $('vinylTapHint').textContent = 'Intro Paused';

    setDockPhase('dockGuessing');

    if (navigator.mediaSession) {
        navigator.mediaSession.playbackState = 'paused';
    }
}

// ---- Replay Intro: Seek back to 0, play until intro end again ----
function replayClip() {
    if (gameState.phase !== 'guessing') return;
    triggerHaptic('tap');

    const audio = gameState.currentAudio;
    if (!audio) return;

    const introDuration = gameState.currentSongData.introDuration;
    gameState.phase = 'replaying';

    // Update UI
    $('vinylRecord').classList.add('spinning');
    $('statePlaying').classList.remove('hidden');
    $('stateGuessing').classList.add('hidden');
    $('stateCelebrating').classList.add('hidden');
    $('listeningText').textContent = `🎵 Listening... (${introDuration}s)`;
    $('vinylTapHint').textContent = 'Tap to Pause';
    $('btnPausePlayingText').textContent = 'Pause';
    $('btnPausePlayingIcon').textContent = '⏸';

    setDockPhase('dockPlaying');

    // Reset timer
    gameState.timeRemaining = introDuration;
    updateTimerDisplay(introDuration);
    $('timerContainer').style.opacity = '1';

    // Seek back to start and play
    audio.currentTime = 0;
    startVisualizer();
    audio.play();

    gameState.timerInterval = setInterval(() => {
        if (!audio || audio.paused) return;

        const elapsed = audio.currentTime;
        gameState.timeRemaining = Math.max(0, introDuration - elapsed);
        updateTimerDisplay(introDuration);

        if (elapsed >= introDuration) {
            clearInterval(gameState.timerInterval);
            gameState.timerInterval = null;
            audio.pause();
            onIntroFinished();
        }
    }, 50);
}

// ---- Correct Guess → Resume playing lyrics & sing along ----
function markCorrect() {
    const validPhases = ['guessing', 'playing', 'replaying'];
    if (!validPhases.includes(gameState.phase)) return;

    triggerHaptic('success');

    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;
    }

    // Update score & streak
    gameState.score++;
    gameState.streak++;
    if (gameState.streak > gameState.bestStreak) {
        gameState.bestStreak = gameState.streak;
    }
    updateScoreDisplay();
    showScorePop('✅ Correct!');

    // Enter celebrating phase
    gameState.phase = 'celebrating';

    // Update UI
    $('statePlaying').classList.add('hidden');
    $('stateGuessing').classList.add('hidden');
    $('stateCelebrating').classList.remove('hidden');
    $('celebratingSongTitle').textContent = gameState.currentSongData.displayName;
    $('vinylRecord').classList.add('spinning');
    $('vinylTapHint').textContent = 'Tap to Pause';
    $('timerContainer').style.opacity = '0';
    $('btnPauseCelebrateText').textContent = 'Pause';
    $('btnPauseCelebrateIcon').textContent = '⏸';

    setDockPhase('dockCelebrating');

    // Resume full song from lyrics
    const audio = gameState.currentAudio;
    if (audio) {
        audio.currentTime = gameState.currentSongData.introDuration;
        startVisualizer();
        audio.play().catch(e => console.error('Vocals play failed:', e));
    }

    updateMediaSession(gameState.currentSongData.displayName, 'Bollywood 90s Hit — Sing Along!');
}

// ---- Replay Full Song Vocals in celebration phase ----
function replayFullSong() {
    if (gameState.phase !== 'celebrating') return;
    triggerHaptic('tap');

    const audio = gameState.currentAudio;
    if (audio) {
        audio.currentTime = gameState.currentSongData.introDuration;
        audio.play();
        $('vinylRecord').classList.add('spinning');
        $('btnPauseCelebrateText').textContent = 'Pause';
        $('btnPauseCelebrateIcon').textContent = '⏸';
        startVisualizer();
    }
}

// ---- Toggle Pause / Resume during active audio playback ----
function togglePauseResume() {
    const playablePhases = ['playing', 'replaying', 'celebrating'];
    if (!playablePhases.includes(gameState.phase)) return;

    triggerHaptic('tap');
    const audio = gameState.currentAudio;
    if (!audio) return;

    if (audio.paused) {
        // Resume
        audio.play().catch(e => console.error('Resume play failed:', e));
        $('vinylRecord').classList.add('spinning');
        $('vinylTapHint').textContent = 'Tap to Pause';
        startVisualizer();

        if (gameState.phase === 'playing' || gameState.phase === 'replaying') {
            const introDuration = gameState.currentSongData.introDuration;
            if (gameState.timerInterval) clearInterval(gameState.timerInterval);

            gameState.timerInterval = setInterval(() => {
                if (!audio || audio.paused) return;

                const elapsed = audio.currentTime;
                gameState.timeRemaining = Math.max(0, introDuration - elapsed);
                updateTimerDisplay(introDuration);

                if (elapsed >= introDuration) {
                    clearInterval(gameState.timerInterval);
                    gameState.timerInterval = null;
                    audio.pause();
                    onIntroFinished();
                }
            }, 50);

            $('btnPausePlayingText').textContent = 'Pause';
            $('btnPausePlayingIcon').textContent = '⏸';
        } else {
            $('btnPauseCelebrateText').textContent = 'Pause';
            $('btnPauseCelebrateIcon').textContent = '⏸';
        }

        showScorePop('▶ Play');
    } else {
        // Pause
        audio.pause();
        $('vinylRecord').classList.remove('spinning');
        $('vinylTapHint').textContent = 'Tap to Play';
        stopVisualizer();

        if (gameState.timerInterval) {
            clearInterval(gameState.timerInterval);
            gameState.timerInterval = null;
        }

        if (gameState.phase === 'playing' || gameState.phase === 'replaying') {
            $('btnPausePlayingText').textContent = 'Resume';
            $('btnPausePlayingIcon').textContent = '▶';
        } else {
            $('btnPauseCelebrateText').textContent = 'Resume';
            $('btnPauseCelebrateIcon').textContent = '▶';
        }

        showScorePop('⏸ Pause');
    }
}

// ---- Next Song after celebration ----
function stopCelebrationAndNext() {
    if (gameState.phase !== 'celebrating') return;
    triggerHaptic('tap');

    $('vinylRecord').classList.remove('spinning');
    stopVisualizer();

    gameState.phase = 'transitioning';
    gameState.currentSongIndex++;

    if (gameState.currentAudio) {
        gameState.currentAudio.pause();
    }

    if (gameState.currentSongIndex >= gameState.totalSongs) {
        setTimeout(() => showResults(), 400);
    } else {
        setTimeout(() => playSong(), 500);
    }
}

// ---- Skip Song (no correct guess) ----
function skipSong() {
    const validPhases = ['guessing', 'playing', 'replaying'];
    if (!validPhases.includes(gameState.phase)) return;

    triggerHaptic('skip');
    gameState.streak = 0;
    updateScoreDisplay();

    gameState.phase = 'transitioning';
    if (gameState.currentAudio) {
        gameState.currentAudio.pause();
    }
    stopVisualizer();

    gameState.currentSongIndex++;

    if (gameState.currentSongIndex >= gameState.totalSongs) {
        setTimeout(() => showResults(), 400);
    } else {
        setTimeout(() => playSong(), 500);
    }
}

// ---- Host Peek Answer Drawer ----
function togglePeekSong() {
    triggerHaptic('tap');
    const peekResult = $('peekResult');
    const peekLabel = $('peekLabel');
    const isHidden = peekResult.classList.contains('hidden');

    if (isHidden) {
        $('peekSongName').textContent = gameState.currentSongData ? gameState.currentSongData.displayName : '';
        peekResult.classList.remove('hidden');
        peekLabel.textContent = 'Hide Answer';
    } else {
        peekResult.classList.add('hidden');
        peekLabel.textContent = 'Peek Answer (Host)';
    }
}

function resetPeekDrawer() {
    $('peekResult').classList.add('hidden');
    $('peekLabel').textContent = 'Peek Answer (Host)';
}

// ---- Cleanup Audio ----
function cleanupAudio() {
    if (gameState.currentAudio) {
        gameState.currentAudio.pause();
        gameState.currentAudio = null;
    }
    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;
    }
    stopVisualizer();
}

// ---- Stop Visualizer ----
function stopVisualizer() {
    if (gameState.animFrameId) {
        cancelAnimationFrame(gameState.animFrameId);
        gameState.animFrameId = null;
    }
    clearVisualizerCanvas();
}

// ======================================================
// UI HELPERS & DYNAMIC CANVAS
// ======================================================

function updateScoreDisplay() {
    $('scoreValue').textContent = gameState.score;
    $('streakValue').textContent = gameState.streak + ' 🔥';
}

function updateProgress() {
    const pct = ((gameState.currentSongIndex) / gameState.totalSongs) * 100;
    $('progressBar').style.width = pct + '%';
    $('progressText').textContent = `Song ${gameState.currentSongIndex + 1} / ${gameState.totalSongs}`;
}

function updateTimerDisplay(totalDuration) {
    const t = Math.max(0, Math.ceil(gameState.timeRemaining));
    $('timerText').textContent = t;

    const circumference = 2 * Math.PI * 54;
    const offset = circumference * (1 - gameState.timeRemaining / totalDuration);
    const progressEl = $('timerProgress');
    progressEl.style.strokeDashoffset = offset;
    progressEl.style.stroke = gameState.timeRemaining <= 3 ? '#ff6b9d' : '#c44dff';
}

function showScorePop(text) {
    const pop = document.createElement('div');
    pop.className = 'score-pop correct';
    pop.textContent = text;
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 900);
}

// ---- Dynamic Canvas Resizing for Retina/Mobile displays ----
function resizeVisualizerCanvas() {
    const canvas = $('visualizer');
    const container = $('visualizerContainer');
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
}

// ======================================================
// AUDIO VISUALIZER
// ======================================================

function startVisualizer() {
    if (gameState.animFrameId) {
        cancelAnimationFrame(gameState.animFrameId);
    }

    const canvas = $('visualizer');
    const container = $('visualizerContainer');
    const ctx = canvas.getContext('2d');
    const analyser = gameState.analyser;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        gameState.animFrameId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        ctx.clearRect(0, 0, width, height);

        const barCount = Math.min(bufferLength, 48);
        const barWidth = width / barCount;
        let x = 0;

        for (let i = 0; i < barCount; i++) {
            const barHeight = (dataArray[i] / 255) * height * 0.75;
            const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);

            if (gameState.phase === 'celebrating') {
                const hue = (i / barCount) * 40 + 140;
                gradient.addColorStop(0, `hsla(${hue}, 70%, 55%, 0.8)`);
                gradient.addColorStop(1, `hsla(${hue}, 70%, 65%, 0.2)`);
            } else {
                const hue = (i / barCount) * 60 + 300;
                gradient.addColorStop(0, `hsla(${hue}, 80%, 60%, 0.8)`);
                gradient.addColorStop(1, `hsla(${hue}, 80%, 70%, 0.2)`);
            }

            ctx.fillStyle = gradient;
            ctx.fillRect(x + 1, height - barHeight, barWidth - 2, barHeight);

            x += barWidth;
        }
    }

    draw();
}

function clearVisualizerCanvas() {
    const canvas = $('visualizer');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ======================================================
// MEDIA SESSION API (Lock Screen & Bluetooth Controls)
// ======================================================

function updateMediaSession(title, artist) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: artist,
            album: "Bollywood 90's Music Quiz",
        });

        navigator.mediaSession.setActionHandler('play', () => togglePauseResume());
        navigator.mediaSession.setActionHandler('pause', () => togglePauseResume());
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            if (gameState.phase === 'celebrating') stopCelebrationAndNext();
            else skipSong();
        });
    }
}

// ======================================================
// RESULTS
// ======================================================

function showResults() {
    cleanupAudio();
    showScreen(resultsScreen);

    const accuracy = Math.round((gameState.score / gameState.totalSongs) * 100);

    $('finalScore').textContent = gameState.score;
    $('totalSongs').textContent = gameState.totalSongs;
    $('bestStreak').textContent = gameState.bestStreak;
    $('accuracy').textContent = accuracy + '%';

    let grade = '';
    if (accuracy >= 90) grade = '🎖️ बॉलीवुड का बादशाह! — Bollywood Legend!';
    else if (accuracy >= 70) grade = '⭐ शानदार! — Excellent Music Fan!';
    else if (accuracy >= 50) grade = '🎵 अच्छा! — Good Effort!';
    else if (accuracy >= 30) grade = '🎶 कोशिश जारी रखो! — Keep Trying!';
    else grade = '📻 और सुनो! — Listen to More Bollywood!';

    $('resultsGrade').textContent = grade;

    if (accuracy >= 50) launchConfetti();
}

// ======================================================
// CONFETTI
// ======================================================

function launchConfetti() {
    const canvas = $('confettiCanvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    const pieces = [];
    const colors = ['#ff6b9d', '#c44dff', '#6e4dff', '#4dc9ff', '#ffd700', '#50c878', '#ff9d4d'];

    for (let i = 0; i < 120; i++) {
        pieces.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            w: Math.random() * 9 + 4,
            h: Math.random() * 5 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            speed: Math.random() * 3.5 + 2,
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.2,
            drift: (Math.random() - 0.5) * 2,
        });
    }

    let frame = 0;
    function animateConfetti() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        frame++;
        let stillVisible = false;
        pieces.forEach(p => {
            p.y += p.speed;
            p.x += p.drift;
            p.angle += p.spin;
            if (p.y < canvas.height + 20) {
                stillVisible = true;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.angle);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = Math.max(0, 1 - (p.y / canvas.height) * 0.5);
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            }
        });
        if (stillVisible && frame < 280) {
            requestAnimationFrame(animateConfetti);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    animateConfetti();
}

// ======================================================
// KEYBOARD CONTROLS (Laptop Hybrid Support)
// ======================================================

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    // Start screen
    if (startScreen.classList.contains('active')) {
        if (key === 'enter' || key === ' ') {
            e.preventDefault();
            startGame();
        }
        return;
    }

    // Game screen
    if (gameScreen.classList.contains('active')) {
        if (key === ' ' || key === 'arrowright') {
            e.preventDefault();
            if (gameState.phase === 'guessing') {
                skipSong();
            } else if (gameState.phase === 'celebrating') {
                stopCelebrationAndNext();
            }
        } else if (key === 'r') {
            e.preventDefault();
            if (gameState.phase === 'guessing') {
                replayClip();
            } else if (gameState.phase === 'celebrating') {
                replayFullSong();
            }
        } else if (key === 'y') {
            e.preventDefault();
            const allowed = ['guessing', 'playing', 'replaying'];
            if (allowed.includes(gameState.phase)) {
                markCorrect();
            }
        } else if (key === 'p') {
            e.preventDefault();
            togglePauseResume();
        } else if (key === 'escape') {
            confirmExitGame();
        }
        return;
    }

    // Results screen
    if (resultsScreen.classList.contains('active')) {
        if (key === 'enter' || key === ' ') {
            e.preventDefault();
            resetGame();
        }
    }
});

// ======================================================
// TOUCH SWIPE GESTURES
// ======================================================

let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }
}, { passive: true });

document.addEventListener('touchend', (e) => {
    if (!gameScreen.classList.contains('active')) return;
    if (e.changedTouches.length === 1) {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        // Swipe Left (skip or next)
        if (diffX < -70 && Math.abs(diffY) < 40) {
            if (gameState.phase === 'guessing') {
                skipSong();
            } else if (gameState.phase === 'celebrating') {
                stopCelebrationAndNext();
            }
        }
    }
}, { passive: true });

// ---- Handle window resize ----
window.addEventListener('resize', () => {
    resizeVisualizerCanvas();
    const canvas = $('confettiCanvas');
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
});

// ---- Initialize ----
createParticles();
loadSongsData();

console.log('🎬 Bollywood 90s Music Quiz v4 (Mobile Touch + Laptop Hybrid) Initialized!');
