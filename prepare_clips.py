#!/usr/bin/env python3
"""
Bollywood Music Game - Action Replay! Video Clip Extractor
Cuts 16:9 widescreen movie scene clips with original audio from YouTube quiz video.
Source: https://www.youtube.com/watch?v=qno6XZbCa8g
"""

import subprocess
import os
import sys
import json
from PIL import Image
import numpy as np

# Exact answer frames and verified Bollywood movies
ROUNDS_CONFIG = [
    {"ans_t": 17, "movie": "Dilwale Dulhania Le Jayenge", "year": 1995},
    {"ans_t": 28, "movie": "Kuch Kuch Hota Hai", "year": 1998},
    {"ans_t": 39, "movie": "Dil To Pagal Hai", "year": 1997},
    {"ans_t": 49, "movie": "Kabhi Khushi Kabhie Gham", "year": 2001},
    {"ans_t": 60, "movie": "Lagaan", "year": 2001},
    {"ans_t": 71, "movie": "Kabhi Alvida Naa Kehna", "year": 2006},
    {"ans_t": 81, "movie": "3 Idiots", "year": 2009},
    {"ans_t": 93, "movie": "My Name Is Khan", "year": 2010},
    {"ans_t": 103, "movie": "Zindagi Na Milegi Dobara", "year": 2011},
    {"ans_t": 114, "movie": "Dhoom 2", "year": 2006},
    {"ans_t": 124, "movie": "Chak De! India", "year": 2007},
    {"ans_t": 136, "movie": "Bajrangi Bhaijaan", "year": 2015},
    {"ans_t": 147, "movie": "Queen", "year": 2013},
    {"ans_t": 157, "movie": "Dangal", "year": 2016},
    {"ans_t": 167, "movie": "PK", "year": 2014},
    {"ans_t": 179, "movie": "Taare Zameen Par", "year": 2007},
    {"ans_t": 190, "movie": "Padmaavat", "year": 2018},
    {"ans_t": 201, "movie": "Kabir Singh", "year": 2019},
    {"ans_t": 211, "movie": "Bajirao Mastani", "year": 2015},
    {"ans_t": 222, "movie": "Dil Chahta Hai", "year": 2001},
    {"ans_t": 233, "movie": "Om Shanti Om", "year": 2007},
    {"ans_t": 244, "movie": "Mera Naam Joker", "year": 1970},
    {"ans_t": 255, "movie": "Rockstar", "year": 2011},
    {"ans_t": 265, "movie": "Gangs of Wasseypur", "year": 2012},
    {"ans_t": 276, "movie": "Rang De Basanti", "year": 2006},
    {"ans_t": 287, "movie": "Koi... Mil Gaya", "year": 2003},
    {"ans_t": 297, "movie": "Kahaani", "year": 2012},
    {"ans_t": 309, "movie": "Barfi!", "year": 2012},
    {"ans_t": 319, "movie": "Wake Up Sid", "year": 2009},
    {"ans_t": 330, "movie": "Chennai Express", "year": 2013},
    {"ans_t": 340, "movie": "Kal Ho Naa Ho", "year": 2003},
    {"ans_t": 352, "movie": "Devdas", "year": 2002},
    {"ans_t": 362, "movie": "Goliyon Ki Raasleela Ram-Leela", "year": 2013},
    {"ans_t": 373, "movie": "Sultan", "year": 2016},
    {"ans_t": 383, "movie": "Uri: The Surgical Strike", "year": 2019},
    {"ans_t": 395, "movie": "Andhadhun", "year": 2018},
    {"ans_t": 406, "movie": "Stree", "year": 2018},
    {"ans_t": 417, "movie": "Badhaai Ho", "year": 2018},
    {"ans_t": 427, "movie": "Simmba", "year": 2018},
    {"ans_t": 438, "movie": "Gully Boy", "year": 2019},
    {"ans_t": 449, "movie": "Article 15", "year": 2019},
    {"ans_t": 460, "movie": "Super 30", "year": 2019},
    {"ans_t": 471, "movie": "Tanu Weds Manu", "year": 2011},
    {"ans_t": 481, "movie": "Vicky Donor", "year": 2012},
    {"ans_t": 492, "movie": "M.S. Dhoni: The Untold Story", "year": 2016},
    {"ans_t": 503, "movie": "Raanjhanaa", "year": 2013},
    {"ans_t": 513, "movie": "Pink", "year": 2016},
    {"ans_t": 525, "movie": "Chhichhore", "year": 2019},
    {"ans_t": 535, "movie": "War", "year": 2019},
    {"ans_t": 546, "movie": "Omkara", "year": 2006}
]

def has_movie_box(video_path, t):
    p = '/private/tmp/d_box_tmp.png'
    subprocess.run(['ffmpeg', '-y', '-ss', f'{t:.2f}', '-i', video_path, '-update', '1', '-vframes', '1', p], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not os.path.exists(p):
        return False
    try:
        im = Image.open(p)
        arr = np.array(im)
        top_border = arr[170, 400:880]
        return np.mean(top_border) > 230
    except Exception:
        return False

def extract_all(video_path):
    os.makedirs('clips', exist_ok=True)
    dataset = []

    print(f"🎬 Processing {len(ROUNDS_CONFIG)} Action Replay movie clips from {video_path}...")
    for idx, r in enumerate(ROUNDS_CONFIG):
        q_num = idx + 1
        ta = r["ans_t"]
        found_start, found_end = None, None
        for step in range(0, 55):
            t = ta - 8.2 + step * 0.1
            box = has_movie_box(video_path, t)
            if box and found_start is None:
                found_start = t
            if not box and found_start is not None and found_end is None and (t - found_start) > 2.0:
                found_end = t
                break

        if found_start is None or found_end is None:
            found_start = ta - 7.5
            found_end = ta - 4.0

        c_start = found_start + 0.1
        c_end = found_end - 0.1
        if (c_end - c_start) < 2.5:
            c_start = found_start
            c_end = found_end

        out_file = f"clips/clip_{q_num:02d}.mp4"
        print(f"  [{q_num:02d}/{len(ROUNDS_CONFIG)}] {r['movie']} ({r['year']}) -> {out_file} ({c_start:.2f}s -> {c_end:.2f}s, {c_end-c_start:.2f}s)")

        cmd = [
            'ffmpeg', '-y',
            '-ss', f"{c_start:.2f}",
            '-to', f"{c_end:.2f}",
            '-i', video_path,
            '-vf', 'crop=688:378:298:174',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
            '-c:a', 'aac', '-b:a', '128k',
            out_file
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        dataset.append({
            "id": f"clip_{q_num:02d}",
            "movie": r["movie"],
            "year": r["year"],
            "video": out_file
        })

    with open("clips_data.json", "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=2, ensure_ascii=False)

    print(f"\n🎉 Successfully saved {len(dataset)} clips to clips/ and updated clips_data.json!")

if __name__ == '__main__':
    video = sys.argv[1] if len(sys.argv) > 1 else '/private/tmp/quiz_720p.mp4'
    if not os.path.exists(video):
        print(f"Error: Video file {video} not found.")
        sys.exit(1)
    extract_all(video)

