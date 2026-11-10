# 🎬 Walkthrough: Bollywood Party Adda (Multi-Game Platform Expansion)

## 🌟 Overview
Transformed the single-game Bollywood Music Quiz into **Bollywood Party Adda**, a comprehensive 6-in-1 Bollywood party game suite designed for living room gatherings, parties, and friendly banter.

All original music quiz features (audio auto-pause/sing-along, vinyl visualizer, calibrated vocal detection, thumb-zone dock) were **100% preserved**, while adding the viral YouTube Stanza Challenge (**Antara Suno, Mukhda Pehchano**), Movie Still Photo Quiz (**Scene Dekho!**), Movie Emoji Riddles (**Emoji Dhamaka!**), Literal English Lyrics (**Angrezi Babu**), and Dialogue Fill-in-the-Blank (**Dialogue Baazi**).

---

## 🎮 The 6 Party Games Implemented

### 1. 🎵 Sur Sartaaj (90's Music Intro Quiz)
- Plays instrumental intros of classic Bollywood tracks and pauses right before lyrics begin.
- Features real-time frequency bar canvas visualizer and interactive vinyl record.
- Single tap/key resumes vocals for an immediate group sing-along.

### 2. 🎙️ Antara Suno, Mukhda Pehchano! (Stanza Guessing Challenge)
- Direct implementation of the YouTube viral challenge ([Reel Se Real Video](https://www.youtube.com/watch?v=FbBkkjUt9iM)):
- Audio seeks directly to `stanzaStart` timestamp and plays the middle verse (Antara).
- Automatically pauses at `stanzaEnd`.
- Can replay the stanza anytime with `[🔄 Replay Antara]` (<kbd>R</kbd>).
- **On correct guess (`markCorrect` / <kbd>Y</kbd>): Seeks directly to `0.0s` (the very beginning) and plays the song from the start for a triumphant Mukhda sing-along!**
- Human-editable metadata file [stanza_data.json](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/stanza_data.json) with [prepare_stanza.py](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/prepare_stanza.py) indexer that preserves custom timestamps.

### 3. 🎬 Scene Dekho! (Movie Still Photo Quiz)
- Guess the blockbuster film from an iconic freeze-frame still photograph.
- **Interactive Mystery Lens**: Starts with an artistic blur & zoom crop. Players or hosts can tap `[🔍 Sharpen Focus (F)]` to progressively sharpen the focus over 3 steps.
- **Progressive Clue Tiers**: `[💡 Show Clue (H)]` reveals Release Year & Director, Star Cast, and Scene Trivia / Iconic Props.
- **Party Host Peek Drawer**: `[👁️ Peek Answer (P)]` allows host to verify guesses discreetly.
- **Celebration Reveal**: Shows movie title, year, lead cast, director, and famous dialogue with celebratory confetti.
- **Custom Image Extensibility**: Automatic [prepare_stills.py](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/prepare_stills.py) indexer allows dropping `.jpg`/`.png` stills into `stills/`.

### 4. 🔤 Emoji Dhamaka! (Movie Emoji Riddles)
- Decipher the movie title from 3–4 vivid emojis (e.g. 🚂👰🌾 = *DDLJ*, 3️⃣🤡🎒 = *3 Idiots*, 💣👨‍💼👓 = *Mr. India*).
- Animated floating emojis with glow effects and progressive hints.

### 5. 🇬🇧 Angrezi Babu, Desi Gaana! (Literal English Lyrics)
- Famous Hindi songs translated word-for-word into hilarious English poetry.
- **Text-to-Speech Integration**: Tap `[🔊 Recite Verse (S)]` to have the browser's speech synthesis recite the lyrics dramatically for the room!
- Clues for singer, music director, and first Hindi words.

### 6. 🗣️ Dialogue Baazi! (Complete the Punchline)
- Legendary dialogues with missing words (e.g. *"Mogambo ______ hua!"*, *"Don ko pakadna mushkil hi nahi, ______ hai"*).
- Interactive fill-in-the-blank reveal animation with character/actor clues.

---

## 🛠️ Architecture & Files Created

| File | Purpose |
| :--- | :--- |
| [index.html](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/index.html) | Hub Screen (`#hubScreen`), Party Config Screen (`#partyStartScreen`), Dynamic Stage (`#partyGameScreen`), and Party Results (`#partyResultsScreen`). |
| [game.js](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/game.js) | Dual-mode audio engine supporting both Intro Quiz and Stanza Quiz with seek-to-zero restart. |
| [party_games.js](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/party_games.js) | Dynamic multi-game engine handling Still, Emoji, Lyrics, and Dialogue modes with state tracking, clue levels, TTS, and shortcuts. |
| [prepare_stanza.py](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/prepare_stanza.py) | CLI utility scanning `songs/` to generate/update `stanza_data.json` while preserving calibrations. |
| [stanza_data.json](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/stanza_data.json) | 27 songs with calibrated `stanzaStart` and `stanzaEnd` timestamps. |
| [prepare_stills.py](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/prepare_stills.py) | CLI utility scanning `stills/` and generating/updating `stills_data.json` while preserving calibrations. |
| [stills_data.json](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/stills_data.json) | 20 curated iconic Bollywood films with cast, director, dialogues, clues, and still references. |
| [emoji_data.json](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/emoji_data.json) | 20 curated movie emoji riddles with trivia and cast clues. |
| [lyrics_data.json](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/lyrics_data.json) | 15 humorous literal English song translations with original Hindi lyrics and composer details. |
| [dialogue_data.json](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/dialogue_data.json) | 15 legendary Bollywood dialogue fill-in-the-blank challenges. |
| [style.css](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/style.css) | Glassmorphic Hub grid, Mystery Lens blur/zoom animations, parchment letter cards, neon blank reveals, and responsive docks. |
| [README.md](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/README.md) | Comprehensive platform overview, control cheatsheet, and customization instructions. |

---

## 🧪 Verification & Validation

1. **Syntax & Compilation**:
   - `node -c game.js && node -c party_games.js`: Passed with exit code 0.
   - `python3 -m py_compile prepare_stanza.py prepare_stills.py server.py prepare.py`: Passed with exit code 0.
2. **Dataset Integrity**:
   - Validated `stanza_data.json` (27 calibrated songs).
   - Validated `stills_data.json`, `emoji_data.json`, `lyrics_data.json`, `dialogue_data.json`.
### 4. Automated End-to-End Chrome Browser Verification
- Executed Chrome DevTools Protocol automation in real headless Google Chrome running against local server:
  - **Sur Sartaaz (Intro Quiz)**: Verified initial fetch of `songs_data.json` (22 songs), Start screen launch, playback queue assembly, host peek drawer, and score tracking.
  - **Antara Suno! (Stanza Quiz)**: Verified fetch of `stanza_data.json` (27 songs), middle verse auto-pause, and restart from `0.0s` on guess.
  - **Scene Dekho!**: Verified 16:9 still visual, 3-tier progressive de-blur/sharpen mystery lens, clue drawer, and celebration card.
  - **Emoji Dhamaka!**: Verified banner cards, progressive clues, and reveal card.
  - **Angrezi Babu**: Verified parchment cards, TTS read-aloud trigger, and original song details reveal.
  - **Dialogue Baazi**: Verified quote box, blank placeholder `? ? ? ?`, hint levels, and punchline reveal.
- **Zero console errors**: 100% clean runtime across all 6 games.
