/* ===========================
   BOLLYWOOD 90's MUSIC QUIZ
   Game Engine v3
   
   Flow: Play full song → auto-pause at intro end → 
         Y = resume from where paused → Space = next song
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
    animFrameId: null,
    currentAudio: null,      // Single audio element for the full song
    currentSongData: null,
};

// ---- DOM References ----
const $ = (id) => document.getElementById(id);
const startScreen = $('startScreen');
const gameScreen = $('gameScreen');
const resultsScreen = $('resultsScreen');

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
        hint.innerHTML = 'Run <kbd>bash prepare.sh</kbd> first to prepare songs';
        $('startBtn').parentNode.insertBefore(hint, $('startBtn').nextSibling);
    }
}

function updateSongCountOptions() {
    const select = $('songCount');
    select.innerHTML = '';
    const total = allSongsData.length;
    const options = [5, 10, 15, 20, 30, 50].filter(n => n <= total);
    if (!options.includes(total)) options.push(total);
    options.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n === total ? `All ${total} Songs` : `${n} Songs`;
        if (n === Math.min(10, total)) opt.selected = true;
        select.appendChild(opt);
    });
}

// ---- Background Particles ----
function createParticles() {
    const container = $('bgParticles');
    const colors = ['#ff6b9d', '#c44dff', '#6e4dff', '#4dc9ff', '#ffd700'];
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');
        const size = Math.random() * 6 + 2;
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
        
        // On iOS Safari, we must only create the MediaElementSource exactly once per Audio element
        if (!gameState.audioSourceNode) {
            gameState.audioSourceNode = gameState.audioContext.createMediaElementSource(audio);
            gameState.analyser = gameState.audioContext.createAnalyser();
            gameState.analyser.fftSize = 256;
            gameState.audioSourceNode.connect(gameState.analyser);
            gameState.analyser.connect(gameState.audioContext.destination);
        }
    } catch (e) {
        console.log('Visualizer setup issue:', e);
    }
}

// ---- Start Game ----
function startGame() {
    if (allSongsData.length === 0) return;

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

        // Play a silent note to trigger audio session initialization on iOS
        const buffer = gameState.audioContext.createBuffer(1, 1, 22050);
        const source = gameState.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(gameState.audioContext.destination);
        source.start(0);

        // Enable native playback session for iOS 17+
        if (navigator.audioSession) {
            navigator.audioSession.type = 'playback';
        }
    } catch (e) {
        console.log('Audio Context unlock error:', e);
    }

    const count = parseInt($('songCount').value);
    gameState.totalSongs = count;
    gameState.currentSongIndex = 0;
    gameState.score = 0;
    gameState.streak = 0;
    gameState.bestStreak = 0;
    gameState.phase = 'idle';

    const allIndices = Array.from({ length: allSongsData.length }, (_, i) => i);
    gameState.songOrder = shuffleArray(allIndices).slice(0, count);

    showScreen(gameScreen);
    updateScoreDisplay();
    updateProgress();

    setTimeout(() => playSong(), 800);
}

// ---- Reset Game ----
function resetGame() {
    gameState.phase = 'idle';
    cleanupAudio();
    showScreen(startScreen);
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

    // Update UI
    $('songNumber').textContent = `Song #${gameState.currentSongIndex + 1}`;
    $('statePlaying').classList.remove('hidden');
    $('stateGuessing').classList.add('hidden');
    $('stateCelebrating').classList.add('hidden');
    $('listeningText').textContent = `🎵 Listening... (Intro: ${introDuration}s)`;
    updateProgress();

    // Start vinyl spinning
    $('vinylRecord').classList.add('spinning');

    // Timer setup
    gameState.timeRemaining = introDuration;
    updateTimerDisplay(introDuration);
    $('timerContainer').style.opacity = '1';

    // Reuse the unlocked global audio element (CORS enabled, iOS-safe)
    if (!gameState.sharedAudio) {
        gameState.sharedAudio = new Audio();
        gameState.sharedAudio.crossOrigin = "anonymous";
    }
    const audio = gameState.sharedAudio;
    audio.src = songData.fullFile;
    audio.load(); // Force source reload
    audio.currentTime = 0;
    gameState.currentAudio = audio;

    // Connect to Web Audio API for visualizer (reuses the source node)
    connectVisualizer(audio);
    startVisualizer();

    // Start playing from the beginning
    audio.play().catch(e => {
        console.error('Audio play failed:', e);
    });

    // Monitor playback — auto-pause at intro boundary
    gameState.timerInterval = setInterval(() => {
        if (!audio || audio.paused) return;

        const elapsed = audio.currentTime;
        gameState.timeRemaining = Math.max(0, introDuration - elapsed);
        updateTimerDisplay(introDuration);

        // Pause when we hit the intro boundary
        if (elapsed >= introDuration) {
            clearInterval(gameState.timerInterval);
            gameState.timerInterval = null;
            audio.pause(); // Pause right at the intro end
            onIntroFinished();
        }
    }, 50); // 50ms for smooth timer + precise pause
}

// ---- Intro Finished → Pause for Guessing ----
function onIntroFinished() {
    gameState.phase = 'guessing';

    // Stop vinyl
    $('vinylRecord').classList.remove('spinning');

    // Stop visualizer
    stopVisualizer();

    // Update UI
    $('statePlaying').classList.add('hidden');
    $('stateGuessing').classList.remove('hidden');
    $('stateCelebrating').classList.add('hidden');
    $('timerContainer').style.opacity = '0.3';
    $('timerText').textContent = '⏸';
}

// ---- Replay Intro: Seek back to 0, play until intro end again ----
function replayClip() {
    if (gameState.phase !== 'guessing') return;

    const audio = gameState.currentAudio;
    if (!audio) return;

    const introDuration = gameState.currentSongData.introDuration;

    gameState.phase = 'replaying';

    // Update UI
    $('vinylRecord').classList.add('spinning');
    $('statePlaying').classList.remove('hidden');
    $('stateGuessing').classList.add('hidden');
    $('stateCelebrating').classList.add('hidden');

    $('listeningText').textContent = `🎵 Listening... (Intro: ${introDuration}s)`;
    // Reset timer
    gameState.timeRemaining = introDuration;
    updateTimerDisplay(introDuration);
    $('timerContainer').style.opacity = '1';

    // Seek back to beginning and play
    audio.currentTime = 0;
    startVisualizer();
    audio.play();

    // Monitor and pause at intro end again
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

// ---- Correct Guess → Resume playing from where it paused or skip remaining music ----
function markCorrect() {
    const validPhases = ['guessing', 'playing', 'replaying'];
    if (!validPhases.includes(gameState.phase)) return;

    const wasPlaying = gameState.phase === 'playing' || gameState.phase === 'replaying';

    // Clear timer checking since we've finished the guessing phase
    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;
    }

    // Update score
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
    $('vinylRecord').classList.add('spinning');
    $('timerContainer').style.opacity = '0';

    // Resume/play full song
    const audio = gameState.currentAudio;
    if (audio) {
        // Jump directly to the start of the lyrics/vocals!
        audio.currentTime = gameState.currentSongData.introDuration;
        startVisualizer();
        audio.play().catch(e => {
            console.error('Play/resume failed:', e);
        });
    }
}

// ---- Toggle Pause / Resume during active play phases ----
function togglePauseResume() {
    const playablePhases = ['playing', 'replaying', 'celebrating'];
    if (!playablePhases.includes(gameState.phase)) return;

    const audio = gameState.currentAudio;
    if (!audio) return;

    if (audio.paused) {
        // Resume playback
        audio.play().catch(e => console.error('Resume play failed:', e));
        $('vinylRecord').classList.add('spinning');
        startVisualizer();

        // If we are in an intro phase, restart the timer countdown
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
        }
        showScorePop('▶ Play');
    } else {
        // Pause playback
        audio.pause();
        $('vinylRecord').classList.remove('spinning');
        stopVisualizer();

        if (gameState.timerInterval) {
            clearInterval(gameState.timerInterval);
            gameState.timerInterval = null;
        }
        showScorePop('⏸ Pause');
    }
}

// ---- Stop celebration and go to next ----
function stopCelebrationAndNext() {
    if (gameState.phase !== 'celebrating') return;

    $('vinylRecord').classList.remove('spinning');
    stopVisualizer();

    gameState.phase = 'transitioning';
    gameState.currentSongIndex++;

    // Pause but don't destroy (cleanup happens in playSong)
    if (gameState.currentAudio) {
        gameState.currentAudio.pause();
    }

    if (gameState.currentSongIndex >= gameState.totalSongs) {
        setTimeout(() => showResults(), 500);
    } else {
        setTimeout(() => playSong(), 600);
    }
}

// ---- Skip Song (no correct guess) ----
function skipSong() {
    if (gameState.phase !== 'guessing') return;
    gameState.streak = 0;
    updateScoreDisplay();

    gameState.phase = 'transitioning';
    if (gameState.currentAudio) {
        gameState.currentAudio.pause();
    }
    stopVisualizer();

    gameState.currentSongIndex++;

    if (gameState.currentSongIndex >= gameState.totalSongs) {
        setTimeout(() => showResults(), 500);
    } else {
        setTimeout(() => playSong(), 600);
    }
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
// UI HELPERS
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
    $('timerProgress').style.strokeDashoffset = offset;
    $('timerProgress').style.stroke = gameState.timeRemaining <= 3 ? '#ff6b9d' : '#c44dff';
}

function showScorePop(text) {
    const pop = document.createElement('div');
    pop.className = 'score-pop correct';
    pop.textContent = text;
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 1000);
}

// ======================================================
// AUDIO VISUALIZER
// ======================================================

function startVisualizer() {
    if (gameState.animFrameId) {
        cancelAnimationFrame(gameState.animFrameId);
    }

    const canvas = $('visualizer');
    const ctx = canvas.getContext('2d');
    const analyser = gameState.analyser;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        gameState.animFrameId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;
            const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);

            if (gameState.phase === 'celebrating') {
                const hue = (i / bufferLength) * 40 + 140;
                gradient.addColorStop(0, `hsla(${hue}, 70%, 55%, 0.8)`);
                gradient.addColorStop(1, `hsla(${hue}, 70%, 65%, 0.2)`);
            } else {
                const hue = (i / bufferLength) * 60 + 300;
                gradient.addColorStop(0, `hsla(${hue}, 80%, 60%, 0.8)`);
                gradient.addColorStop(1, `hsla(${hue}, 80%, 70%, 0.2)`);
            }

            ctx.fillStyle = gradient;
            ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);

            ctx.fillStyle = gameState.phase === 'celebrating'
                ? `hsla(150, 70%, 55%, 0.1)`
                : `hsla(300, 80%, 60%, 0.1)`;
            ctx.fillRect(x, 0, barWidth - 1, barHeight * 0.3);

            x += barWidth;
        }
    }

    draw();
}

function clearVisualizerCanvas() {
    const canvas = $('visualizer');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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

    for (let i = 0; i < 150; i++) {
        pieces.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            w: Math.random() * 10 + 5,
            h: Math.random() * 6 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            speed: Math.random() * 4 + 2,
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
        if (stillVisible && frame < 300) {
            requestAnimationFrame(animateConfetti);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    animateConfetti();
}

// ======================================================
// KEYBOARD CONTROLS
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

// ---- Handle window resize ----
window.addEventListener('resize', () => {
    const canvas = $('confettiCanvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// ---- Initialize ----
createParticles();
loadSongsData();

console.log('🎬 Bollywood 90s Music Quiz v3 — Play intro → Pause → Resume on correct guess!');
