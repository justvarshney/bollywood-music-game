# 🎬 Bollywood 90's Music Quiz Game

A sleek, interactive web-based music guessing game designed for parties and friendly get-togethers! The game plays the instrumental intro of classic Bollywood tracks, automatically pauses right before the lyrics/vocals kick in, and lets your audience guess. 

Once someone identifies the track, a single keypress resumes the song exactly from where it was paused so everyone can enjoy and sing along!

---

## ✨ Features

- **📱 Mobile-First Touch Controls & Thumb Zone**: Specially engineered dynamic bottom action dock designed for comfortable one-handed play on smartphones.
- **⚡ Zero Teaser Clips**: Plays directly from the full song file, using precise in-browser timing to pause and resume.
- **🔍 Intelligent Silence/Vocal Detection**: Includes a python preparation script that auto-detects where the intro music ends and lyrics begin.
- **👁️ Host Peek Answer**: Discreet toggle for party hosts to preview the song name on mobile without revealing it to the room.
- **📳 Haptic & Gesture Feedback**: Tactile vibration pulses on taps, correct guesses, and swipe-to-skip gestures.
- **🛠️ Manual Calibration**: Allows you to manually tweak vocal start timestamps in `songs_data.json` for perfect pacing, which are preserved even when adding new songs.
- **🎹 Laptop Keyboard Shortcuts**: Full hybrid support — play seamlessly on laptops or touchscreens.
- **🎨 Premium Visuals**: Beautiful dark-mode interface with glassmorphism panels, retro vinyl spinning animations, real-time frequency bar visualizer, responsive layouts, and celebration confetti.
- **🔁 Stream-Friendly Server**: Includes a range-request supporting local web server to guarantee fluid seeking and audio control in modern browsers.

---

## 🎮 How to Play

1. **Start Quiz** – Choose how many songs to play with quick pill chips (5, 10, 20, 30, or all) and tap **Start Quiz** (or press <kbd>Enter</kbd>).
2. **Listening Phase** – The retro vinyl record spins and the purple visualizer dances while the instrumental intro plays.
3. **Guessing Phase** – The music automatically pauses before vocals start. The timer changes to `⏸` and the visualizer pauses.
4. **Resuming/Skipping**:
   - Tap **✅ Someone Guessed It!** (or press <kbd>Y</kbd>) to resume the vocals/lyrics directly for a sing-along!
   - Tap **⏭ Skip Song** (or swipe left / press <kbd>Space</kbd>) to move to the next track.
   - Tap **🔄 Replay Intro** (or press <kbd>R</kbd>) if your audience wants another listen.
   - Tap **👁️ Peek Answer** to discreetly check the track title.

### 🕹️ Controls (Mobile Touch & Keyboard)
| Action | Mobile Touch | Laptop Key | Valid States |
| :--- | :--- | :--- | :--- |
| **Start / Play Again** | Tap `🎶 Start Quiz` / `🔄 Play Again` | <kbd>Enter</kbd> / <kbd>Space</kbd> | Start Screen / Results |
| **✅ Someone Guessed It!** | Tap `✅ Someone Guessed It!` or `⚡ Got It!` | <kbd>Y</kbd> | Listening / Guessing |
| **⏸ Pause / Resume** | Tap Vinyl Record or `⏸ Pause` button | <kbd>P</kbd> | Listening / Celebrating |
| **🔄 Replay Intro** | Tap `🔄 Replay Intro` | <kbd>R</kbd> | Guessing |
| **⏭ Skip / Next Song** | Tap `⏭ Skip` / `⏭ Next Song` or Swipe Left | <kbd>Space</kbd> / <kbd>→</kbd> | Guessing / Celebrating |
| **👁️ Host Peek Title** | Tap `👁️ Peek Answer (Host)` | - | Guessing |
| **✕ Exit to Home** | Tap `✕` Top-Left Button | <kbd>Esc</kbd> | Game Screen |

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
