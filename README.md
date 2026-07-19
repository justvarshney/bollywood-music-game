# 🎬 Bollywood 90's Music Quiz Game

A sleek, interactive web-based music guessing game designed for parties and friendly get-togethers! The game plays the instrumental intro of classic Bollywood tracks, automatically pauses right before the lyrics/vocals kick in, and lets your audience guess. 

Once someone identifies the track, a single keypress resumes the song exactly from where it was paused so everyone can enjoy and sing along!

---

## ✨ Features

- **⚡ Zero Teaser Clips**: Plays directly from the full song file, using precise in-browser timing to pause and resume.
- **🔍 Intelligent Silence/Vocal Detection**: Includes a python preparation script that auto-detects where the intro music ends and lyrics begin.
- **🛠️ Manual Calibration**: Allows you to manually tweak vocal start timestamps in `songs_data.json` for perfect pacing, which are preserved even when adding new songs.
- **🎹 Laptop Keyboard Shortcuts**: Optimized for quick, seamless control while hosting the game.
- **🎨 Premium Visuals**: Beautiful dark-mode interface with glassmorphism panels, retro vinyl spinning animations, real-time frequency bar visualizer, responsive layouts, and celebration confetti.
- **🔁 Stream-Friendly Server**: Includes a range-request supporting local web server to guarantee fluid seeking and audio control in modern browsers.

---

## 🎮 How to Play

1. **Start Quiz** – Choose how many songs to play (5, 10, 20, or all) and press <kbd>Enter</kbd> or click **Start**.
2. **Listening Phase** – The retro vinyl record spins and the purple visualizer dances while the instrumental intro plays.
3. **Guessing Phase** – The music automatically pauses before vocals start. The timer changes to `⏸` and the visualizer fades out.
4. **Resuming/Skipping**:
   - If someone guesses correctly, press <kbd>Y</kbd> to resume the vocals/lyrics directly!
   - If no one knows it, press <kbd>Space</kbd> or <kbd>→</kbd> to skip to the next track.

### ⌨️ Host Keyboard Shortcuts
| Key | Action | Valid States |
| :--- | :--- | :--- |
| <kbd>Enter</kbd> / <kbd>Space</kbd> | Start Game / Replay Game | Start Screen / Results Screen |
| <kbd>Y</kbd> | ✅ **Someone Guessed It!** (Resume song from lyrics) | Listening / Guessing |
| <kbd>P</kbd> | ⏸ **Pause / Play** (Toggle audio playback) | Listening / Celebrating |
| <kbd>R</kbd> | 🔄 **Replay Intro Clip** (Start intro music again) | Guessing |
| <kbd>Space</kbd> / <kbd>→</kbd> | ⏭ **Skip / Next Song** (Move to next track) | Guessing / Celebrating |

---

## 🚀 Setup & Installation

### Prerequisite
Make sure you have **python3** and **ffmpeg** installed on your system.
- *macOS*: `brew install ffmpeg`
- *Windows*: Download from the official website or use `winget install Gyan.FFmpeg`.

### Step 1: Clone and Enter the Project
```bash
git clone https://github.com/justvarshney/bollywood-music-game.git
cd bollywood-music-game
```

### Step 2: Add Your Songs
Place your individual Bollywood MP3 song files directly into the `songs/` directory:
```
songs/
├── Tujhe Dekha To.mp3
├── Chaiyya Chaiyya.mp3
├── Dil To Pagal Hai.mp3
└── ...
```
*Note: The filename (excluding `.mp3`) automatically becomes the display name of the song in the game.*

### Step 3: Run the Song Preparer
Generate the game dataset and auto-detect vocal start positions:
```bash
python3 prepare.py
```

### Step 4: Run the Web Server & Play
Start the custom local web server (needed to support audio seeking range requests):
```bash
python3 server.py 8080
```
Open **[http://localhost:8080](http://localhost:8080)** in your web browser and enjoy!

---

## ⚙️ Advanced Customization

### 🔧 Fine-Tuning Intro Timestamps
The automated detection is smart, but music intro layouts vary. If a song's lyrics start too early or late, you can override it:
1. Open `songs_data.json` in any text editor.
2. Locate the song and change `introDuration` (in seconds) to the correct value:
   ```json
   {
     "id": "1",
     "displayName": "Tujhe Dekha To",
     "introDuration": 24.5,
     "fullFile": "songs/Tujhe Dekha To.mp3"
   }
   ```
3. Save the file and refresh the browser.
4. **Re-running is safe!** Running `python3 prepare.py` again will **preserve all your manual updates** while importing any new songs.

### 📁 Using a Jukebox Compilation
If you have a continuous jukebox audio file instead of individual files:
1. Edit `extract_from_jukebox.sh` to define the timestamps for each song boundary.
2. Run it to split the compilation:
   ```bash
   bash extract_from_jukebox.sh
   ```
3. Run the preparer:
   ```bash
   python3 prepare.py
   ```
