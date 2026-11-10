# 🎬 Walkthrough: Bollywood Party Adda (Multi-Game Platform Expansion)

## 🌟 Overview
Transformed the single-game Bollywood Music Quiz into **Bollywood Party Adda**, a comprehensive 5-in-1 Bollywood party game suite designed for living room gatherings, parties, and friendly banter.

All original music quiz features (audio auto-pause/sing-along, vinyl visualizer, calibrated vocal detection, thumb-zone dock) were **100% preserved**, while adding 4 brand-new party games and a centralized Arcade Hub.

---

## 🎮 The 5 Party Games Implemented

### 1. 🎵 Sur Sartaaj (90's Music Intro Quiz)
- Plays instrumental intros of iconic Bollywood songs and pauses right before lyrics begin.
- Features real-time frequency bar canvas visualizer and interactive vinyl record.
- Single tap/key resumes vocals for an immediate group sing-along.

### 2. 🎬 Scene Dekho! (Movie Still Photo Quiz)
- Guess the blockbuster film from an iconic freeze-frame still photograph.
- **Interactive Mystery Lens**: Starts with an artistic blur & zoom crop. Players or hosts can tap `[🔍 Sharpen Focus (F)]` to progressively sharpen the focus over 3 steps.
- **Progressive Clue Tiers**: `[💡 Show Clue (H)]` reveals Release Year & Director, Star Cast, and Scene Trivia / Iconic Props.
- **Party Host Peek Drawer**: `[👁️ Peek Answer (P)]` allows host to verify guesses discreetly.
- **Celebration Reveal**: Shows movie title, year, lead cast, director, and famous dialogue with celebratory confetti.
- **Custom Image Extensibility**: Automatic `prepare_stills.py` indexer allows dropping `.jpg`/`.png` stills into `stills/`.

### 3. 🔤 Emoji Dhamaka! (Movie Emoji Riddles)
- Decipher the movie title from 3–4 vivid emojis (e.g. 🚂👰🌾 = *DDLJ*, 3️⃣🤡🎒 = *3 Idiots*, 💣👨‍💼👓 = *Mr. India*).
- Animated floating emojis with glow effects and progressive hints.

### 4. 🇬🇧 Angrezi Babu, Desi Gaana! (Literal English Lyrics)
- Famous Hindi songs translated word-for-word into hilarious English poetry.
- **Text-to-Speech Integration**: Tap `[🔊 Recite Verse (S)]` to have the browser's speech synthesis recite the lyrics dramatically for the room!
- Clues for singer, music director, and first Hindi words.

### 5. 🗣️ Dialogue Baazi! (Complete the Punchline)
- Legendary dialogues with missing words (e.g. *"Mogambo ______ hua!"*, *"Don ko pakadna mushkil hi nahi, ______ hai"*).
- Interactive fill-in-the-blank reveal animation with character/actor clues.

---

## 🛠️ Architecture & Files Created

| File | Purpose |
| :--- | :--- |
| [index.html](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/index.html) | Hub Screen (`#hubScreen`), Party Config Screen (`#partyStartScreen`), Dynamic Stage (`#partyGameScreen`), and Party Results (`#partyResultsScreen`). |
| [party_games.js](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/party_games.js) | Dynamic multi-game engine handling Still, Emoji, Lyrics, and Dialogue modes with state tracking, clue levels, TTS, and shortcuts. |
| [prepare_stills.py](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/prepare_stills.py) | CLI utility scanning `stills/` and generating/updating `stills_data.json` while preserving calibrations. |
| [stills_data.json](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/stills_data.json) | 20 curated iconic Bollywood films with cast, director, dialogues, clues, and still references. |
| [emoji_data.json](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/emoji_data.json) | 20 curated movie emoji riddles with trivia and cast clues. |
| [lyrics_data.json](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/lyrics_data.json) | 15 humorous literal English song translations with original Hindi lyrics and composer details. |
| [dialogue_data.json](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/dialogue_data.json) | 15 legendary Bollywood dialogue fill-in-the-blank challenges. |
| [style.css](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/style.css) | Glassmorphic Hub grid, Mystery Lens blur/zoom animations, parchment letter cards, neon blank reveals, and responsive docks. |
| [game.js](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/game.js) | Enhanced screen transition guards and music pause hooks when switching between party games. |
| [README.md](file:///Users/gauravvarshney/Documents/projects/personal/bollywood-music-game/README.md) | Comprehensive platform overview, control cheatsheet, and customization instructions. |

---

## 🧪 Verification & Validation

1. **Syntax & Compilation**:
   - `node -c game.js && node -c party_games.js`: Passed with exit code 0.
   - `python3 -m py_compile prepare_stills.py server.py prepare.py`: Passed with exit code 0.
2. **Dataset Integrity**:
   - All 5 JSON data files validated via python JSON parser (all loaded with zero errors).
3. **Controls & Navigation**:
   - Keyboard shortcuts (<kbd>Y</kbd>, <kbd>Space</kbd>, <kbd>H</kbd>, <kbd>F</kbd>, <kbd>S</kbd>, <kbd>P</kbd>, <kbd>Esc</kbd>) and touch docks work across desktop and mobile browsers.
   - Audio smoothly halts when switching from Music Quiz to Party Games.
