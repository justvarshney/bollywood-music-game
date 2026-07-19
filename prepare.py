#!/usr/bin/env python3
"""
prepare.py — Song Preparation Script for Bollywood Music Quiz.
Auto-detects vocal start timestamps and generates/updates songs_data.json.
PRESERVES any manual changes you make to introDuration in songs_data.json!
"""

import os
import sys
import json
import subprocess
import glob

SONGS_DIR = "songs"
OUTPUT_JSON = "songs_data.json"
DEFAULT_INTRO = 15.0

# Terminal colors
GREEN = "\033[0;32m"
YELLOW = "\033[1;33m"
CYAN = "\033[0;36m"
RED = "\033[0;31m"
NC = "\033[0m"

def get_vocal_start_detected(filepath):
    """Uses ffmpeg silencedetect to find where vocals start."""
    try:
        # Check first 90 seconds for silence gaps (transition between intro music and vocals)
        # noise=-30dB, duration=0.25s
        cmd = [
            "ffmpeg", "-t", "90", "-i", filepath,
            "-af", "silencedetect=noise=-30dB:d=0.25",
            "-f", "null", "-"
        ]
        result = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True, check=True)
        stderr = result.stderr

        # Extract silence_start lines
        silence_starts = []
        for line in stderr.split('\n'):
            if "silence_start:" in line:
                try:
                    val = float(line.split("silence_start:")[1].strip().split()[0])
                    # Skip very early brief silences
                    if val >= 8.0:
                        silence_starts.append(val)
                except ValueError:
                    continue

        if silence_starts:
            return round(silence_starts[0], 1)

        # Try a second pass with -25dB (less sensitive) if first fails
        cmd = [
            "ffmpeg", "-t", "90", "-i", filepath,
            "-af", "silencedetect=noise=-25dB:d=0.3",
            "-f", "null", "-"
        ]
        result = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True, check=True)
        stderr = result.stderr
        
        silence_starts = []
        for line in stderr.split('\n'):
            if "silence_start:" in line:
                try:
                    val = float(line.split("silence_start:")[1].strip().split()[0])
                    if val >= 8.0:
                        silence_starts.append(val)
                except ValueError:
                    continue

        if silence_starts:
            return round(silence_starts[0], 1)

    except Exception as e:
        pass
    
    return None

def main():
    print(f"{CYAN}🎵 Bollywood Music Quiz — Song Preparation{NC}")

    if not os.path.isdir(SONGS_DIR):
        print(f"{RED}❌ Error: '{SONGS_DIR}' directory not found.{NC}")
        sys.exit(1)

    mp3_files = glob.glob(os.path.join(SONGS_DIR, "*.mp3"))
    if not mp3_files:
        print(f"{RED}❌ Error: No MP3 files found in {SONGS_DIR}/{NC}")
        print("   Please place your song files in the songs/ directory and try again.")
        sys.exit(1)

    print(f"   Found {GREEN}{len(mp3_files)}{NC} songs in {SONGS_DIR}/")

    # Load existing song data if it exists to preserve manual modifications
    existing_data = {}
    if os.path.exists(OUTPUT_JSON):
        try:
            with open(OUTPUT_JSON, "r", encoding="utf-8") as f:
                data = json.load(f)
                # Map fullFile path to its dict config
                for item in data:
                    existing_data[item.get("fullFile")] = item
            print(f"   Loaded existing metadata for {YELLOW}{len(existing_data)}{NC} songs from {OUTPUT_JSON}")
        except Exception as e:
            print(f"   ⚠️  Could not read existing {OUTPUT_JSON} (corrupted or empty). Will overwrite.")

    new_songs_data = []

    for index, filepath in enumerate(sorted(mp3_files), 1):
        filename = os.path.basename(filepath)
        basename = os.path.splitext(filename)[0]

        # Pretty display name
        # Remove common prefixes like digits followed by dots/hyphens, clean underscores
        display_name = re_clean_name(basename)

        print(f"{YELLOW}[{index}/{len(mp3_files)}]{NC} Processing: {GREEN}{display_name}{NC}")

        # Check if we already have this song in existing data
        if filepath in existing_data:
            existing_item = existing_data[filepath]
            intro_duration = existing_item.get("introDuration", DEFAULT_INTRO)
            print(f"   💾 Preserved manual override: {CYAN}{intro_duration}s{NC}")
        else:
            # New song: auto-detect intro
            detected = get_vocal_start_detected(filepath)
            if detected is not None:
                intro_duration = detected
                print(f"   ✅ Auto-detected intro: {CYAN}{intro_duration}s{NC}")
            else:
                intro_duration = DEFAULT_INTRO
                print(f"   ⚠️  Vocal start not detected. Using default: {intro_duration}s")

        new_songs_data.append({
            "id": str(index),
            "displayName": display_name,
            "introDuration": intro_duration,
            "fullFile": filepath
        })

    # Save to json file
    try:
        with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
            json.dump(new_songs_data, f, indent=2, ensure_ascii=False)
        print(f"\n{GREEN}✅ Preparation complete!{NC}")
        print(f"   📋 Saved {len(new_songs_data)} songs to {OUTPUT_JSON}")
        print(f"   💡 You can edit {OUTPUT_JSON} to manually tweak any song's 'introDuration' timestamp.")
    except Exception as e:
        print(f"\n{RED}❌ Error saving JSON: {e}{NC}")


def re_clean_name(name):
    # Remove leading numbers and separators (e.g., "01. Song", "02 - Song")
    import re
    cleaned = re.sub(r'^\d+[._-]\s*', '', name)
    # Replace underscores/hyphens with spaces
    cleaned = cleaned.replace('_', ' ').replace('-', ' ')
    # Normalize multiple spaces
    cleaned = re.sub(r'\s+', ' ', cleaned)
    return cleaned.strip()


if __name__ == "__main__":
    main()
