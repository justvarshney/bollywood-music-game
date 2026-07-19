#!/bin/bash
# Extract individual full songs from the jukebox compilation into songs/ directory
# These can then be processed by prepare.sh like any other individual song files.

SOURCE="/Users/gauravvarshney/Documents/projects/personal/Bollywood Hindi 90's Songs Juke Box Part 02 HQ Audio Non Stop Music.mp3"
OUTDIR="songs"
mkdir -p "$OUTDIR"

# Song start timestamps (silence_end values from ffmpeg analysis)
STARTS=(0 313.248 814.802 1177.292 1509.219 1768.005 2139.194 2467.370 2816.800 3119.829 3534.554 3983.736 4433.532 4752.303 5071.062 5409.433 5730.897 6118.567 6457.075 6906.187 7220.028 7601.088 7976.839 8445.521 8760.245 9131.390 9540.851 9901.617 10211.564 10582.326 11007.119 11497.474 11838.839 12203.506 12574.465 12930.289 13326.262 13849.645 14264.660 14568.302 14887.526 15324.472 15699.791 16071.901 16437.741 16757.455 17066.497 17896.250 18265.114 18589.523)

# Silence durations at each gap (used to calculate song end times)
GAPS=(0 4.536 3.583 4.221 5.689 3.005 5.718 6.006 3.139 4.693 2.934 2.964 6.246 3.559 4.299 4.739 4.933 3.976 3.368 5.311 5.441 4.819 5.990 3.944 6.659 5.179 4.466 3.341 1.889 4.582 5.415 4.304 5.597 13.308 3.159 2.420 6.533 2.117 4.047 2.197 3.458 4.024 4.456 3.989 3.938 7.373 4.543 3.585 4.827 2.573)

TOTAL=${#STARTS[@]}
TOTAL_DURATION=18719.254

echo "Extracting $TOTAL individual songs from jukebox..."

for (( i=0; i<TOTAL; i++ )); do
    START=${STARTS[$i]}
    PADDED=$(printf "%02d" $((i+1)))

    # Calculate song duration: from current start to next song's silence_start
    if (( i+1 < TOTAL )); then
        NEXT_START=${STARTS[$((i+1))]}
        NEXT_GAP=${GAPS[$((i+1))]}
        END=$(echo "$NEXT_START - $NEXT_GAP" | bc)
    else
        END=$TOTAL_DURATION
    fi

    DURATION=$(echo "$END - $START" | bc)

    echo "  Song $PADDED: ${START}s → ${END}s (${DURATION}s)"
    ffmpeg -y -ss "$START" -i "$SOURCE" -t "$DURATION" -acodec libmp3lame -q:a 2 "$OUTDIR/Jukebox Song ${PADDED}.mp3" -loglevel error
done

echo ""
echo "✅ Done! Extracted $TOTAL songs into $OUTDIR/"
echo "   Now run: bash prepare.sh"
