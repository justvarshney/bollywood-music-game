# 🎬 Bollywood Party Adda — 7 Filmi Party Games in 1!

An interactive, web-based Bollywood party gaming platform designed for game nights, family gatherings, and friendly get-togethers! Play on laptops or smartphones with one-handed touch controls, host peek answers, haptic feedback, and vibrant celebration effects.

---

## 🎮 The 7 Party Games

### 1. 🎵 Sur Sartaaj (90's Music Intro Quiz)
- Plays the instrumental intro of classic Bollywood tracks.
- Automatically pauses right before lyrics/vocals kick in.
- A single keypress/tap resumes the song for a room sing-along!

### 2. 🎙️ Antara Suno, Mukhda Pehchano! (Stanza Guessing Challenge)
- As featured in viral YouTube Bollywood challenges: listen to a middle verse (**Antara**) and guess the song's opening hook (**Mukhda**)!
- Plays directly between calibrated `stanzaStart` and `stanzaEnd` timestamps.
- **After the guess, the song plays triumphantly from the very beginning (`0.0s`) for the ultimate sing-along!**

### 3. 🎬 Scene Dekho! (Movie Still Photo Quiz)
- Guess the blockbuster film from an iconic freeze-frame still photograph / scene screenshot.
- Displays full, crisp movie screenshots centered directly without any blur or distortion.
- Clean and uncluttered: reveals the movie title and release year.
- Drop your own screenshots (`.jpg`, `.png`, `.webp`) into `stills/` and run `python3 prepare_stills.py`.

### 4. 🔤 Emoji Dhamaka! (Movie Emoji Riddles)
- Decipher the blockbuster movie title from a sequence of 3-4 vivid emojis (e.g. 🚂👰🌾 = *DDLJ*, 3️⃣🤡🎒 = *3 Idiots*, 💣👨‍💼👓 = *Mr. India*).
- Complete with genre, year, and lead cast clues.

### 5. 🇬🇧 Angrezi Babu, Desi Gaana! (Literal English Lyrics)
- Famous Hindi songs translated word-for-word into hilarious English poetry!
- Tap `[🔊 Recite Verse]` to hear browser Text-to-Speech recite the English verse dramatically.
- Guess the original Hindi track and sing the real lyrics!

### 6. 🗣️ Dialogue Baazi! (Complete the Punchline)
- Legendary dialogues with the punchline missing (e.g. *"Mogambo ______ hua!"*, *"Don ko pakadna mushkil hi nahi, ______ hai"*).
- **Dialogue Audio Snippets**: Tap `[🎧 Listen Audio]` (or press <kbd>A</kbd>) to hear the actual dialogue audio clip!
- Plays the audio snippet automatically on answer reveal for instant room celebration.
- Drop dialogue MP3 clips into `dialogues/` and run `python3 prepare_dialogues.py`.

### 7. 🎬 Action Replay! (Movie Video Scene Clip Quiz)
- Watch iconic 3-second scene video clips with real actors, original dialogue, and background music!
- Cropped to pure 16:9 widescreen cinema footage centered on screen.
- Replay anytime by tapping `[🔁 Replay Clip]` or pressing <kbd>R</kbd>!
- Contains 50 legendary Bollywood scenes extracted from YouTube quiz challenges.
- Extracted using `python3 prepare_clips.py`.

---

## 🕹️ Controls (Mobile Touch & Hybrid Laptop Keys)

| Action | Mobile Touch | Laptop Key | Games |
| :--- | :--- | :--- | :--- |
| **Start / Play Again** | Tap `🚀 Start Game` / `🔄 Play Again` | <kbd>Enter</kbd> / <kbd>Space</kbd> | All Screens |
| **✅ Someone Guessed It!** | Tap `✅ Someone Guessed It!` or `⚡ Got It!` | <kbd>Y</kbd> / <kbd>Enter</kbd> | All Games |
| **⏭ Next Question / Song** | Tap `⏭ Next Question` or `⏭ Next Song` | <kbd>Space</kbd> / <kbd>→</kbd> | Revealed Stage |
| **⏭ Skip Question** | Tap `⏭ Skip` / Swipe Left | <kbd>Space</kbd> / <kbd>→</kbd> | Active Stage |
| **🔄 Replay Stanza / Intro** | Tap `🔄 Replay Antara` / `🔄 Replay Intro` | <kbd>R</kbd> | Stanza & Intro Quiz |
| **🔁 Replay Scene Video Clip** | Tap `🔁 Replay Clip` | <kbd>R</kbd> | Action Replay! |
| **💡 Reveal Next Clue** | Tap `💡 Show Clue` | <kbd>H</kbd> | Emoji, Lyrics, Dialogue |
| **🎧 Play Dialogue Audio** | Tap `🎧 Listen Audio` / `🔊 Replay` | <kbd>A</kbd> | Dialogue Baazi |
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

## 🛠️ Customizing Songs, Stanzas & Stills

### Fine-Tuning Stanza Timestamps (`stanza_data.json`):
1. Open `stanza_data.json` in any text editor.
2. Adjust `stanzaStart` and `stanzaEnd` (in seconds) for any song:
   ```json
   {
     "id": "1",
     "displayName": "Aye Mere Humsafar",
     "stanzaStart": 95.0,
     "stanzaEnd": 118.0,
     "fullFile": "songs/Aye Mere Humsafar.mp3"
   }
   ```
3. Save the file and refresh your browser.
4. When adding new songs, run `python3 prepare_stanza.py` to auto-index new files while **preserving all your manual timestamp calibrations**.

### Adding Custom Music Tracks:
1. Place MP3 files in `songs/`.
2. Run:
   ```bash
   python3 prepare.py
   python3 prepare_stanza.py
   ```
3. Refresh the browser!

### Adding Custom Movie Still Photos:
1. Drop image files (`.jpg`, `.jpeg`, `.png`, `.webp`, `.svg`) into the `stills/` folder, naming them after the movie.
2. Run:
   ```bash
   python3 prepare_stills.py
   ```
3. It will index your images into `stills_data.json` while preserving your custom clues and dialogues!

### Adding Custom Dialogue Audio Snippets:
1. Drop audio snippet files (`.mp3`, `.wav`, `.m4a`) into the `dialogues/` folder (e.g. `dialogues/Mogambo Khush Hua.mp3`).
2. Run:
   ```bash
   python3 prepare_dialogues.py
   ```
3. It will automatically match audio files to existing dialogues in `dialogue_data.json` by dialogue quote, movie title, or character name! If you add a brand new audio file, it creates a template entry ready to be played.

### Managing Action Replay Video Clips:
1. All 50 movie scene video clips are stored in `clips/` and cataloged in `clips_data.json`.
2. Each clip contains authentic video and audio cropped to a crisp 16:9 widescreen frame.
3. To regenerate or extract clips from the source video, run:
   ```bash
   python3 prepare_clips.py /path/to/quiz_video.mp4
   ```



