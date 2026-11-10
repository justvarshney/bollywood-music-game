#!/usr/bin/env python3
"""
Bollywood Stanza Game (Antara Suno, Mukhda Pehchano) Preparer
Scans the `songs/` directory, extracts durations, and generates/updates `stanza_data.json`.
Preserves any manual calibrations you make to `stanzaStart` and `stanzaEnd`.
"""

import os
import json
import subprocess
import re

SONGS_DIR = "songs"
DATA_FILE = "stanza_data.json"

# Known calibrated Antara timestamps for common songs
KNOWN_STANZAS = {
    "aati kya khandala": (72.0, 92.0),
    "ambarsariya": (68.0, 88.0),
    "aye mere humsafar": (95.0, 118.0),
    "chandni o meri chandni": (75.0, 95.0),
    "chhupana bhi nahin aata": (92.0, 114.0),
    "chunnari chunnari": (85.0, 106.0),
    "dheeme dheeme": (46.0, 66.0),
    "garmi": (52.0, 72.0),
    "gazab ka hai din": (78.0, 98.0),
    "hawa hawa e hawa": (82.0, 104.0),
    "i love you": (94.0, 116.0),
    "in aankhon ki masti ke": (84.0, 108.0),
    "koi mil gaya": (88.0, 110.0),
    "laila main laila": (72.0, 92.0),
    "mehbooba mehbooba": (65.0, 85.0),
    "na jaane kya hua": (68.0, 90.0),
    "neele neele ambar par": (62.0, 84.0),
    "oonchi hai building": (82.0, 104.0),
    "papa kehte hain": (88.0, 110.0),
    "parbat se kali ghata takrai": (76.0, 98.0),
    "pyar ka tohfa": (72.0, 94.0),
    "so gaya yeh jahan": (95.0, 118.0),
    "tu mere dil mein basja": (78.0, 100.0),
    "what jhumka": (74.0, 95.0),
    "yeh dil deewana": (98.0, 120.0),
    "julie julie": (76.0, 96.0)
}

def clean_display_name(filename):
    """Strip extension and clean up common rip strings like 320 Kbps."""
    name = os.path.splitext(filename)[0]
    name = re.sub(r'\b(320|128|256)\s*kbps\b', '', name, flags=re.IGNORECASE)
    name = re.sub(r'[\s_\-]+', ' ', name).strip()
    return name

def get_audio_duration(filepath):
    """Get audio duration in seconds using ffprobe."""
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'json', filepath
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(res.stdout)
        return float(data['format']['duration'])
    except Exception:
        return 240.0

def prepare_stanzas():
    if not os.path.exists(SONGS_DIR):
        print(f"Error: Directory '{SONGS_DIR}' does not exist.")
        return

    # Load existing stanza metadata to preserve manual calibrations
    existing_by_file = {}
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for item in data:
                    existing_by_file[item['fullFile']] = item
        except Exception as e:
            print(f"Warning reading {DATA_FILE}: {e}")

    files = sorted([f for f in os.listdir(SONGS_DIR) if f.lower().endswith('.mp3')])
    print(f"Found {len(files)} MP3 songs in '{SONGS_DIR}/'.")

    final_items = []
    for idx, f in enumerate(files, 1):
        rel_path = f"{SONGS_DIR}/{f}"
        display_name = clean_display_name(f)
        key = display_name.lower()

        # Check existing calibration
        if rel_path in existing_by_file:
            item = existing_by_file[rel_path]
            # Ensure id and paths are accurate
            item['id'] = str(idx)
            item['fullFile'] = rel_path
            final_items.append(item)
            continue

        # Look for matching known stanzas or calculate intelligent defaults
        s_start, s_end = None, None
        for k_title, (start, end) in KNOWN_STANZAS.items():
            if k_title in key:
                s_start, s_end = start, end
                break

        if s_start is None:
            # Default to ~35% into song for 20 seconds
            dur = get_audio_duration(rel_path)
            s_start = round(max(30.0, dur * 0.32), 1)
            s_end = round(s_start + 18.0, 1)

        item = {
            "id": str(idx),
            "displayName": display_name,
            "stanzaStart": float(s_start),
            "stanzaEnd": float(s_end),
            "fullFile": rel_path
        }
        final_items.append(item)

    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(final_items, f, indent=2, ensure_ascii=False)

    print(f"✅ Successfully wrote {len(final_items)} songs to '{DATA_FILE}'.")
    print(f"💡 You can fine-tune 'stanzaStart' and 'stanzaEnd' for any song in '{DATA_FILE}'.")

if __name__ == "__main__":
    prepare_stanzas()
