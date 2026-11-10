# 🎬 Bollywood Party Adda — 5 Filmi Party Games in 1!

An interactive, web-based Bollywood party gaming platform designed for game nights, family gatherings, and friendly get-togethers! Play on laptops or smartphones with one-handed touch controls, host peek answers, haptic feedback, and vibrant celebration effects.

---

## 🎮 The 5 Party Games

### 1. 🎵 Sur Sartaaj (90's Music Intro Quiz)
- Plays the instrumental intro of classic Bollywood tracks.
- Automatically pauses right before lyrics/vocals kick in.
- A single keypress/tap resumes the song for a room sing-along!

### 2. 🎬 Scene Dekho! (Movie Still Photo Quiz)
- Guess the blockbuster film from an iconic freeze-frame still photograph.
- **Mystery Lens mode**: Starts with an artistic blur/zoom crop and lets you sharpen focus (`[🔍 Sharpen Focus]`) or view progressive clues (Year & Director, Star Cast, Iconic Props).
- Or toggle **Instant Crisp** for direct guessing.
- Includes pre-built iconic scenes and allows dropping your own images into `stills/`.

### 3. 🔤 Emoji Dhamaka! (Movie Emoji Riddles)
- Decipher the blockbuster movie title from a sequence of 3-4 vivid emojis (e.g. 🚂👰🌾 = *DDLJ*, 3️⃣🤡🎒 = *3 Idiots*, 💣👨‍💼👓 = *Mr. India*).
- Complete with genre, year, and lead cast clues.

### 4. 🇬🇧 Angrezi Babu, Desi Gaana! (Literal English Lyrics)
- Famous Hindi songs translated word-for-word into hilarious English poetry!
- Tap `[🔊 Recite Verse]` to hear browser Text-to-Speech recite the English verse dramatically.
- Guess the original Hindi track and sing the real lyrics!

### 5. 🗣️ Dialogue Baazi! (Complete the Punchline)
- Legendary dialogues with the punchline missing (e.g. *"Mogambo ______ hua!"*, *"Don ko pakadna mushkil hi nahi, ______ hai"*).
- Spoken character and actor clues with gold celebration reveals.

---

## 🕹️ Controls (Mobile Touch & Hybrid Laptop Keys)

| Action | Mobile Touch | Laptop Key | Games |
| :--- | :--- | :--- | :--- |
| **Start / Play Again** | Tap `🚀 Start Game` / `🔄 Play Again` | <kbd>Enter</kbd> / <kbd>Space</kbd> | All Screens |
| **✅ Someone Guessed It!** | Tap `✅ Someone Guessed It!` or `⚡ Got It!` | <kbd>Y</kbd> / <kbd>Enter</kbd> | All Games |
| **⏭ Next Question / Song** | Tap `⏭ Next Question` or `⏭ Next Song` | <kbd>Space</kbd> / <kbd>→</kbd> | Revealed Stage |
| **⏭ Skip Question** | Tap `⏭ Skip` / Swipe Left | <kbd>Space</kbd> / <kbd>→</kbd> | Active Stage |
| **💡 Reveal Next Clue** | Tap `💡 Show Clue` | <kbd>H</kbd> | Scene, Emoji, Lyrics, Dialogue |
| **🔍 Sharpen Image Focus** | Tap `🔍 Sharpen Focus` | <kbd>F</kbd> | Scene Dekho |
| **🔊 Recite English Verse** | Tap `🔊 Recite Verse` | <kbd>S</kbd> | Angrezi Babu |
| **👁️ Host Peek Title** | Tap `👁️ Peek Answer (Host)` | <kbd>P</kbd> | All Games |
| **✕ Return to Game Hub** | Tap `✕` or `← 🏠 All Games Hub` | <kbd>Esc</kbd> | All Games |

---

## 🚀 Setup & Running Locally

### Prerequisite
Make sure you have **python3** and **ffmpeg** installed on your system.

### Step 1: Run the Server
```bash
python3 server.py 8080
```
Open **[http://localhost:8080](http://localhost:8080)** in your browser and pick any game from the Bollywood Party Arcade!

---

## 🛠️ Adding Your Own Custom Songs & Stills

### Adding Custom Music Tracks:
1. Place MP3 files in `songs/`.
2. Run:
   ```bash
   python3 prepare.py
   ```
3. Refresh the browser! Manual calibrations in `songs_data.json` are automatically preserved.

### Adding Custom Movie Still Photos:
1. Drop image files (`.jpg`, `.jpeg`, `.png`, `.webp`, `.svg`) into the `stills/` folder, naming them after the movie (e.g., `Dilwale Dulhania Le Jayenge.jpg`, `Sholay.png`).
2. Run:
   ```bash
   python3 prepare_stills.py
   ```
3. It will index your images into `stills_data.json` while preserving your custom clues and dialogues!

