#!/usr/bin/env python3
"""
Bollywood Dialogue Audio Preparer
Scans the `dialogues/` directory for audio snippet files (.mp3, .wav, .m4a, .ogg, .aac),
matches them with dialogue items, and updates `dialogue_data.json`.
Preserves all existing prompts, missing words, and clues in `dialogue_data.json`.
"""

import os
import json
import re

DIALOGUES_DIR = "dialogues"
DATA_FILE = "dialogue_data.json"
SUPPORTED_EXTS = {".mp3", ".wav", ".m4a", ".ogg", ".aac", ".flac"}

def normalize_text(text):
    """Normalize string for fuzzy matching (lowercase, alphanumeric only)."""
    return re.sub(r'[^a-z0-9]+', '', str(text).lower())

def clean_name(filename):
    """Strip extension and clean extra spaces."""
    name = os.path.splitext(filename)[0]
    return re.sub(r'[\s_]+', ' ', name).strip()

def prepare_dialogues():
    os.makedirs(DIALOGUES_DIR, exist_ok=True)
    
    # Load existing dialogue data
    if not os.path.exists(DATA_FILE):
        print(f"Error: {DATA_FILE} not found!")
        return

    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            dialogues = json.load(f)
    except Exception as e:
        print(f"Error reading {DATA_FILE}: {e}")
        return

    # Index audio files from dialogues/ directory
    found_audio_files = []
    if os.path.exists(DIALOGUES_DIR):
        for f in sorted(os.listdir(DIALOGUES_DIR)):
            ext = os.path.splitext(f)[1].lower()
            if ext in SUPPORTED_EXTS:
                found_audio_files.append(f)

    print(f"🔍 Found {len(found_audio_files)} audio files in '{DIALOGUES_DIR}/'.")

    # Build matchers for existing dialogues
    # Map by id, normalized movie, normalized character, normalized fullQuote keywords
    used_files = set()
    matched_count = 0

    for item in dialogues:
        item_id = item.get("id", "").lower()
        norm_movie = normalize_text(item.get("movie", ""))
        norm_char = normalize_text(item.get("character", ""))
        norm_quote = normalize_text(item.get("fullQuote", ""))
        norm_missing = normalize_text(item.get("missingWord", ""))

        matched_file = None

        # 1. If item already has a valid existing audio file in dialogues/
        existing_audio = item.get("audio")
        if existing_audio and os.path.exists(existing_audio):
            base = os.path.basename(existing_audio)
            if base in found_audio_files:
                matched_file = base

        # 2. Match with scanned files
        if not matched_file:
            for f in found_audio_files:
                if f in used_files:
                    continue
                norm_f = normalize_text(os.path.splitext(f)[0])

                # Match by id (e.g. diag_1.mp3)
                if norm_f == item_id:
                    matched_file = f
                    break
                
                # Match by full quote or significant substring
                if norm_f in norm_quote or norm_quote in norm_f:
                    matched_file = f
                    break

                # Match by movie name
                if norm_movie and (norm_f == norm_movie or norm_f in norm_movie or norm_movie in norm_f):
                    matched_file = f
                    break

                # Match by character name
                if norm_char and (norm_f == norm_char or norm_char in norm_f):
                    matched_file = f
                    break

        if matched_file:
            item["audio"] = f"{DIALOGUES_DIR}/{matched_file}"
            used_files.add(matched_file)
            matched_count += 1
            print(f"   ✓ Linked '{matched_file}' -> {item.get('movie')} (\"{item.get('missingWord')}\")")
        else:
            # Keep audio key if present or set to default intended filename if not already set
            if "audio" not in item:
                # Generate recommended clean filename based on full quote
                clean_quote = re.sub(r'[^a-zA-Z0-9\s]', '', item.get('fullQuote', '')).strip()
                words = clean_quote.split()[:5]
                recommended_name = " ".join(words) if words else item.get('movie', 'dialogue')
                item["audio"] = f"{DIALOGUES_DIR}/{recommended_name}.mp3"

    # Any leftover audio files in dialogues/ that didn't match existing dialogues
    unmatched_files = [f for f in found_audio_files if f not in used_files]
    if unmatched_files:
        print(f"\n➕ Found {len(unmatched_files)} new audio file(s) without existing dialogues. Creating entries:")
        for idx, f in enumerate(unmatched_files, 1):
            title = clean_name(f)
            new_id = f"diag_{len(dialogues) + 1}"
            new_item = {
                "id": new_id,
                "prompt": f"{title} ______ !",
                "missingWord": "MissingWord",
                "character": "Iconic Character",
                "actor": "Legendary Actor",
                "movie": title,
                "year": "Classic",
                "clue1": f"Classic Bollywood Dialogue from {title}",
                "clue2": "Listen to the audio snippet to fill in the punchline!",
                "fullQuote": title,
                "audio": f"{DIALOGUES_DIR}/{f}"
            }
            dialogues.append(new_item)
            print(f"   + Added new question: {new_id} ({f})")

    # Write back to dialogue_data.json
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(dialogues, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Successfully updated '{DATA_FILE}' ({len(dialogues)} dialogues, {matched_count} audio files linked).")
    print(f"💡 Drop audio clips (.mp3) into '{DIALOGUES_DIR}/' and re-run this script anytime!")

if __name__ == "__main__":
    prepare_dialogues()

