"""
Bollywood Arcade - Online Multiplayer Real-Time Engine
Supports remote multiplayer rooms, RFC 6455 WebSockets, synchronized question broadcasting,
speed-based scoring, live leaderboards, and grand finale podium.
"""

import json
import time
import random
import string
import struct
import base64
import hashlib
import secrets
import threading
import urllib.parse

# Bollywood Avatars for multiplayer participants
FILMI_AVATARS = ["💃", "🕶️", "👑", "🎸", "🦁", "🎭", "🍿", "🚀", "💎", "🤠", "🎯", "🔥"]

def clean_title(title):
    for bad in ["320 Kbps", "128 Kbps", ".mp3"]:
        title = title.replace(bad, "")
    return title.strip()

# ============================================================
# RFC 6455 WEBSOCKET FRAME HELPERS (Standard Library)
# ============================================================

def make_ws_frame(msg):
    """Encodes a string message into an unmasked RFC 6455 text frame (Server -> Browser)."""
    if isinstance(msg, dict):
        data = json.dumps(msg).encode('utf-8')
    elif isinstance(msg, str):
        data = msg.encode('utf-8')
    else:
        data = bytes(msg)

    length = len(data)
    if length <= 125:
        header = bytes([0x81, length])
    elif length <= 65535:
        header = struct.pack('!BBH', 0x81, 126, length)
    else:
        header = struct.pack('!BBQ', 0x81, 127, length)
    return header + data

def read_ws_frame(sock):
    """
    Reads an RFC 6455 frame from a client socket (Browser -> Server).
    Browser frames are always masked with a 4-byte key.
    Returns (opcode, text_payload) or (None, None) on disconnect.
    """
    try:
        head = sock.recv(2)
        if not head or len(head) < 2:
            return None, None
        b1, b2 = head[0], head[1]
        opcode = b1 & 0x0F
        is_masked = (b2 & 0x80) != 0
        payload_len = b2 & 0x7F

        if payload_len == 126:
            ext = sock.recv(2)
            if len(ext) < 2:
                return None, None
            payload_len = struct.unpack('!H', ext)[0]
        elif payload_len == 127:
            ext = sock.recv(8)
            if len(ext) < 8:
                return None, None
            payload_len = struct.unpack('!Q', ext)[0]

        mask = sock.recv(4) if is_masked else None
        if is_masked and len(mask) < 4:
            return None, None

        data = bytearray()
        while len(data) < payload_len:
            chunk = sock.recv(payload_len - len(data))
            if not chunk:
                break
            data.extend(chunk)

        if is_masked and mask:
            data = bytearray(b ^ mask[i % 4] for i, b in enumerate(data))

        return opcode, data.decode('utf-8', errors='ignore')
    except Exception:
        return None, None


# ============================================================
# DATASET LOADER FOR 4-OPTION MULTIPLE CHOICE QUIZZES
# ============================================================

def load_game_questions(game_type, count=10):
    """
    Loads quiz data for any of the 7 Bollywood games and generates 4 multiple-choice
    options (1 correct + 3 plausible distractors) for each question.
    """
    count = max(5, min(count, 20))

    if game_type == 'dialogue':
        with open('dialogue_data.json') as f:
            data = json.load(f)
        sampled = random.sample(data, min(count, len(data)))
        all_words = list(set(d['missingWord'].strip() for d in data if d.get('missingWord')))
        questions = []
        for d in sampled:
            correct = d['missingWord'].strip()
            distractors = random.sample([w for w in all_words if w.lower() != correct.lower()], 3)
            options = [correct] + distractors
            random.shuffle(options)
            questions.append({
                'prompt': d['prompt'],
                'subtitle': f"{d['movie']} ({d.get('year', '')}) • Spoken by {d.get('character', '')}".replace(' ()', ''),
                'mediaType': 'audio',
                'mediaUrl': d.get('audio', ''),
                'options': options,
                'correctIndex': options.index(correct),
                'correctAnswer': correct,
                'reveal': d.get('fullQuote', d['prompt']),
                'trivia': f"Actor: {d.get('actor', '')} • Movie: {d.get('movie', '')}"
            })
        return questions

    elif game_type == 'emoji':
        with open('emoji_data.json') as f:
            data = json.load(f)
        sampled = random.sample(data, min(count, len(data)))
        all_movies = list(set(d['movie'].strip() for d in data if d.get('movie')))
        questions = []
        for d in sampled:
            correct = d['movie'].strip()
            distractors = random.sample([m for m in all_movies if m != correct], 3)
            options = [correct] + distractors
            random.shuffle(options)
            questions.append({
                'prompt': d['emojis'],
                'subtitle': 'Guess the Bollywood Blockbuster from these Emojis!',
                'mediaType': 'emoji',
                'mediaUrl': '',
                'options': options,
                'correctIndex': options.index(correct),
                'correctAnswer': correct,
                'reveal': f"{d['movie']}" + (f" ({d['year']})" if d.get('year') else ""),
                'trivia': f"Starring: {d.get('leadCast', '')} • {d.get('trivia', '')}"
            })
        return questions

    elif game_type == 'lyrics':
        with open('lyrics_data.json') as f:
            data = json.load(f)
        sampled = random.sample(data, min(count, len(data)))
        all_songs = list(set(d['hindiTitle'].strip() for d in data if d.get('hindiTitle')))
        questions = []
        for d in sampled:
            correct = d['hindiTitle'].strip()
            distractors = random.sample([s for s in all_songs if s != correct], 3)
            options = [correct] + distractors
            random.shuffle(options)
            questions.append({
                'prompt': d['englishVerse'],
                'subtitle': 'Which Hindi song has this literal English translation?',
                'mediaType': 'lyrics',
                'mediaUrl': '',
                'options': options,
                'correctIndex': options.index(correct),
                'correctAnswer': correct,
                'reveal': f"{d.get('firstHindiWords', correct)} • Movie: {d.get('movie', '')}",
                'trivia': f"Singer: {d.get('singer', '')} • Music: {d.get('musicDirector', '')}"
            })
        return questions

    elif game_type == 'still':
        with open('stills_data.json') as f:
            data = json.load(f)
        sampled = random.sample(data, min(count, len(data)))
        all_movies = list(set(d['movie'].strip() for d in data if d.get('movie')))
        questions = []
        for d in sampled:
            correct = d['movie'].strip()
            distractors = random.sample([m for m in all_movies if m != correct], 3)
            options = [correct] + distractors
            random.shuffle(options)
            questions.append({
                'prompt': 'Identify this Bollywood Movie from the Scene Still',
                'subtitle': d.get('sceneDescription', 'Iconic Bollywood Scene Photograph'),
                'mediaType': 'image',
                'mediaUrl': d.get('image', ''),
                'options': options,
                'correctIndex': options.index(correct),
                'correctAnswer': correct,
                'reveal': f"{d['movie']}" + (f" ({d['year']})" if d.get('year') else ""),
                'trivia': f"Starring: {d.get('leadCast', 'Bollywood Legends')}"
            })
        return questions

    elif game_type in ('intro', 'stanza'):
        with open('songs_data.json') as f:
            data = json.load(f)
        sampled = random.sample(data, min(count, len(data)))
        all_titles = list(set(clean_title(d['displayName']) for d in data if d.get('displayName')))
        questions = []
        for d in sampled:
            correct = clean_title(d['displayName'])
            distractors = random.sample([t for t in all_titles if t != correct], 3)
            options = [correct] + distractors
            random.shuffle(options)
            is_intro = (game_type == 'intro')
            questions.append({
                'prompt': 'Listen to the Intro Music & Guess the Song!' if is_intro else 'Listen to the Antara (Verse) & Guess the Song!',
                'subtitle': '90s Bollywood Music Quiz',
                'mediaType': 'audio',
                'mediaUrl': d.get('fullFile', ''),
                'introDuration': d.get('introDuration', 10.0),
                'options': options,
                'correctIndex': options.index(correct),
                'correctAnswer': correct,
                'reveal': correct,
                'trivia': f"Song: {correct}"
            })
        return questions

    elif game_type == 'clip':
        with open('clips_data.json') as f:
            data = json.load(f)
        sampled = random.sample(data, min(count, len(data)))
        all_movies = list(set(d['movie'].strip() for d in data if d.get('movie')))
        questions = []
        for d in sampled:
            correct = d['movie'].strip()
            distractors = random.sample([m for m in all_movies if m != correct], 3)
            options = [correct] + distractors
            random.shuffle(options)
            questions.append({
                'prompt': 'Watch this Movie Scene Clip & Guess the Film!',
                'subtitle': 'Iconic Bollywood Scene Clip',
                'mediaType': 'video',
                'mediaUrl': d.get('video', ''),
                'options': options,
                'correctIndex': options.index(correct),
                'correctAnswer': correct,
                'reveal': f"{d['movie']}" + (f" ({d['year']})" if d.get('year') else ""),
                'trivia': f"Movie: {d['movie']}"
            })
        return questions

    return []


# ============================================================
# PLAYER MODEL
# ============================================================

class Player:
    def __init__(self, token, name, avatar, is_host=False):
        self.token = token
        self.name = name
        self.avatar = avatar
        self.is_host = is_host
        self.connected = False
        self.ready = False
        self.score = 0
        self.streak = 0
        self.best_streak = 0
        self.answers_count = 0
        self.correct_count = 0
        self.total_response_time_ms = 0
        
        # Current round tracking
        self.last_answer_index = None
        self.last_response_time_ms = None
        self.last_points_earned = 0
        self.last_is_correct = False
        
        # Socket handle
        self.sock = None
        self.lock = threading.Lock()

    def send(self, payload):
        """Thread-safe WebSocket frame send."""
        with self.lock:
            if not self.sock:
                return False
            try:
                frame = make_ws_frame(payload)
                self.sock.sendall(frame)
                return True
            except Exception:
                self.connected = False
                self.sock = None
                return False

    def to_dict(self):
        return {
            "token": self.token,
            "name": self.name,
            "avatar": self.avatar,
            "isHost": self.is_host,
            "connected": self.connected,
            "ready": self.ready,
            "score": self.score,
            "streak": self.streak,
            "hasAnswered": (self.last_answer_index is not None),
            "lastPoints": self.last_points_earned,
            "lastCorrect": self.last_is_correct,
            "lastResponseTime": self.last_response_time_ms
        }


# ============================================================
# ROOM MODEL & STATE MACHINE
# ============================================================

class MultiplayerRoom:
    def __init__(self, room_code, host_user_id, host_token, game_type, round_count, questions):
        self.code = room_code
        self.host_user_id = host_user_id
        self.host_token = host_token
        self.game_type = game_type
        self.round_count = round_count
        self.questions = questions
        
        self.players = {}  # token -> Player
        self.status = "LOBBY"  # LOBBY | STARTING | QUESTION_ACTIVE | ROUND_REVEAL | GAME_OVER
        self.current_question_index = 0
        self.question_start_time = 0.0
        self.question_duration = 15  # seconds
        
        self.lock = threading.RLock()
        self.timer_thread = None
        self.created_at = time.time()
        self.last_active_at = time.time()

    def add_player(self, name, is_host=False, custom_token=None):
        token = custom_token or secrets.token_hex(4)
        avatar_idx = len(self.players) % len(FILMI_AVATARS)
        avatar = FILMI_AVATARS[avatar_idx]
        player = Player(token, name, avatar, is_host=is_host)
        self.players[token] = player
        return player

    def get_player(self, token):
        return self.players.get(token)

    def broadcast(self, payload, exclude_token=None):
        """Broadcasts a payload to all players in the room."""
        with self.lock:
            for token, p in self.players.items():
                if exclude_token and token == exclude_token:
                    continue
                p.send(payload)

    def get_leaderboard(self):
        """Returns player list sorted by score descending."""
        sorted_players = sorted(
            [p for p in self.players.values() if not p.is_host or len(self.players) == 1],
            key=lambda x: (x.score, -x.total_response_time_ms),
            reverse=True
        )
        # If all are hosts (or host is playing), include everyone
        if not sorted_players:
            sorted_players = sorted(self.players.values(), key=lambda x: x.score, reverse=True)

        return [
            {
                "rank": i + 1,
                "token": p.token,
                "name": p.name,
                "avatar": p.avatar,
                "score": p.score,
                "streak": p.streak,
                "lastPoints": p.last_points_earned,
                "lastCorrect": p.last_is_correct,
                "hasAnswered": (p.last_answer_index is not None)
            }
            for i, p in enumerate(sorted_players)
        ]

    def get_lobby_state(self):
        return {
            "type": "LOBBY_STATE",
            "roomCode": self.code,
            "status": self.status,
            "gameType": self.game_type,
            "roundCount": self.round_count,
            "players": [p.to_dict() for p in self.players.values()],
            "allReady": all(p.ready for p in self.players.values() if not p.is_host) if len(self.players) > 1 else True
        }

    def start_game(self, requester_token):
        """Called by host to start the game."""
        with self.lock:
            player = self.players.get(requester_token)
            if not player or not player.is_host:
                return False, "Only the host can start the game."
            if self.status != "LOBBY":
                return False, "Game is already in progress."

            self.status = "STARTING"
            self.broadcast({
                "type": "COUNTDOWN_START",
                "seconds": 3,
                "message": "Bollywood Battle Starting in..."
            })

            # Start background thread for 3-second countdown -> first question
            threading.Thread(target=self._countdown_and_start_first_question, daemon=True).start()
            return True, "Starting game!"

    def _countdown_and_start_first_question(self):
        time.sleep(3.2)
        with self.lock:
            self.current_question_index = 0
            self._start_current_question()

    def _start_current_question(self):
        """Begins the active question round."""
        with self.lock:
            if self.current_question_index >= len(self.questions):
                self._finish_game()
                return

            self.status = "QUESTION_ACTIVE"
            self.question_start_time = time.time()
            self.question_duration = 15

            # Reset player answers for this question
            for p in self.players.values():
                p.last_answer_index = None
                p.last_response_time_ms = None
                p.last_points_earned = 0
                p.last_is_correct = False

            q = self.questions[self.current_question_index]

            # Broadcast to all players (SAFE payload: NO correctIndex!)
            payload = {
                "type": "QUESTION_ACTIVE",
                "roundIndex": self.current_question_index + 1,
                "totalRounds": len(self.questions),
                "gameType": self.game_type,
                "prompt": q["prompt"],
                "subtitle": q.get("subtitle", ""),
                "mediaType": q.get("mediaType", ""),
                "mediaUrl": q.get("mediaUrl", ""),
                "introDuration": q.get("introDuration", 10.0),
                "options": q["options"],
                "duration": self.question_duration,
                "serverTime": time.time()
            }
            self.broadcast(payload)

            # Timer for question expiry
            idx = self.current_question_index
            threading.Thread(target=self._question_timer_watchdog, args=(idx,), daemon=True).start()

    def _question_timer_watchdog(self, question_idx):
        """Watches 15-second timer for a question."""
        time.sleep(self.question_duration + 0.3)
        with self.lock:
            if self.status == "QUESTION_ACTIVE" and self.current_question_index == question_idx:
                self._end_round_and_reveal()

    def submit_answer(self, token, option_index, response_time_ms=None):
        """Records an answer submission from a player."""
        with self.lock:
            if self.status != "QUESTION_ACTIVE":
                return False, "Question is not currently active."

            player = self.players.get(token)
            if not player:
                return False, "Player not found."

            if player.last_answer_index is not None:
                return False, "You have already answered this question."

            q = self.questions[self.current_question_index]
            now = time.time()
            calc_resp_ms = int((now - self.question_start_time) * 1000)
            if response_time_ms is None or response_time_ms <= 0:
                response_time_ms = calc_resp_ms
            else:
                response_time_ms = min(response_time_ms, calc_resp_ms + 1000)

            player.last_answer_index = option_index
            player.last_response_time_ms = response_time_ms
            player.total_response_time_ms += response_time_ms
            player.answers_count += 1

            is_correct = (option_index == q["correctIndex"])
            player.last_is_correct = is_correct

            if is_correct:
                player.correct_count += 1
                player.streak += 1
                player.best_streak = max(player.best_streak, player.streak)

                # Kahoot-style speed points (1000 base + up to 500 speed bonus)
                speed_factor = max(0.0, 1.0 - (response_time_ms / (self.question_duration * 1000.0)))
                speed_bonus = int(500 * speed_factor)
                streak_bonus = (player.streak - 1) * 100
                round_points = 1000 + speed_bonus + streak_bonus

                player.last_points_earned = round_points
                player.score += round_points
            else:
                player.streak = 0
                player.last_points_earned = 0

            # Broadcast progress (e.g. "Pooja answered! (2/4)")
            answered_players = [p for p in self.players.values() if p.last_answer_index is not None and not p.is_host]
            eligible_players = [p for p in self.players.values() if not p.is_host]
            if not eligible_players:
                eligible_players = list(self.players.values())
                answered_players = [p for p in self.players.values() if p.last_answer_index is not None]

            self.broadcast({
                "type": "PLAYER_ANSWERED",
                "playerToken": player.token,
                "playerName": player.name,
                "answeredCount": len(answered_players),
                "totalCount": len(eligible_players)
            })

            # Check if all players have answered
            if len(answered_players) >= len(eligible_players):
                # Trigger reveal with short 0.5s pause
                threading.Thread(target=self._quick_reveal_trigger, daemon=True).start()

            return True, "Answer recorded!"

    def _quick_reveal_trigger(self):
        time.sleep(0.5)
        with self.lock:
            if self.status == "QUESTION_ACTIVE":
                self._end_round_and_reveal()

    def _end_round_and_reveal(self):
        """Reveals the correct answer and displays live standings."""
        with self.lock:
            if self.status != "QUESTION_ACTIVE":
                return

            self.status = "ROUND_REVEAL"
            q = self.questions[self.current_question_index]

            leaderboard = self.get_leaderboard()

            reveal_payload = {
                "type": "ROUND_REVEAL",
                "roundIndex": self.current_question_index + 1,
                "totalRounds": len(self.questions),
                "correctIndex": q["correctIndex"],
                "correctAnswer": q["correctAnswer"],
                "reveal": q.get("reveal", ""),
                "trivia": q.get("trivia", ""),
                "leaderboard": leaderboard,
                "playerResults": {
                    p.token: {
                        "chosenIndex": p.last_answer_index,
                        "isCorrect": p.last_is_correct,
                        "pointsEarned": p.last_points_earned,
                        "newScore": p.score,
                        "streak": p.streak,
                        "responseTimeMs": p.last_response_time_ms
                    }
                    for p in self.players.values()
                }
            }
            self.broadcast(reveal_payload)

            # Auto-advance after 5.5 seconds of reveal
            idx = self.current_question_index
            threading.Thread(target=self._auto_advance_watchdog, args=(idx,), daemon=True).start()

    def _auto_advance_watchdog(self, question_idx):
        time.sleep(5.5)
        with self.lock:
            if self.status == "ROUND_REVEAL" and self.current_question_index == question_idx:
                self.current_question_index += 1
                if self.current_question_index < len(self.questions):
                    self._start_current_question()
                else:
                    self._finish_game()

    def _finish_game(self):
        """Calculates finale podium, awards filmi badges, and broadcasts game over."""
        with self.lock:
            self.status = "GAME_OVER"
            leaderboard = self.get_leaderboard()

            # Assign Special Fun Awards
            awards = []
            if leaderboard:
                winner = leaderboard[0]
                awards.append({
                    "title": "Bollywood Badshah 👑",
                    "playerName": winner["name"],
                    "avatar": winner["avatar"],
                    "desc": f"Grand Champion with {winner['score']} points!"
                })

            # Fastest average speed
            active_p = [p for p in self.players.values() if p.answers_count > 0]
            if active_p:
                fastest = min(active_p, key=lambda p: (p.total_response_time_ms / max(1, p.answers_count)))
                avg_sec = round((fastest.total_response_time_ms / max(1, fastest.answers_count)) / 1000.0, 1)
                awards.append({
                    "title": "Superfast Express ⚡",
                    "playerName": fastest.name,
                    "avatar": fastest.avatar,
                    "desc": f"Lighting-fast reflex! Avg {avg_sec}s per answer!"
                })

            # Best streak
            if active_p:
                streak_king = max(active_p, key=lambda p: p.best_streak)
                if streak_king.best_streak >= 2:
                    awards.append({
                        "title": "Toofan Mail 🔥",
                        "playerName": streak_king.name,
                        "avatar": streak_king.avatar,
                        "desc": f"Unstoppable streak of {streak_king.best_streak} correct in a row!"
                    })

            game_over_payload = {
                "type": "GAME_OVER",
                "gameType": self.game_type,
                "totalRounds": len(self.questions),
                "leaderboard": leaderboard,
                "podium": leaderboard[:3],
                "awards": awards
            }
            self.broadcast(game_over_payload)


# ============================================================
# MULTIPLAYER ROOM MANAGER
# ============================================================

class MultiplayerManager:
    def __init__(self):
        self.rooms = {}  # room_code -> MultiplayerRoom
        self.lock = threading.Lock()

    def generate_room_code(self):
        """Generates a memorable 6-char room code like BOL924."""
        chars = "".join(random.choices(string.ascii_uppercase, k=3))
        digits = "".join(random.choices(string.digits, k=3))
        code = f"{chars}{digits}"
        while code in self.rooms:
            code = "".join(random.choices(string.ascii_uppercase, k=3)) + "".join(random.choices(string.digits, k=3))
        return code

    def create_room(self, host_user_id, game_type, round_count, player_names, host_origin="http://localhost:8080"):
        """Creates a new game room with custom share links for named players."""
        with self.lock:
            code = self.generate_room_code()
            host_token = f"host_{secrets.token_hex(6)}"

            questions = load_game_questions(game_type, count=round_count)
            if not questions:
                return False, "Failed to load questions for this game type.", None

            room = MultiplayerRoom(code, host_user_id, host_token, game_type, len(questions), questions)

            # Add Host as controller/spectator
            host_player = room.add_player("Host 🎬", is_host=True, custom_token=host_token)

            # Add named players
            player_links = []
            for name in player_names:
                name = name.strip()
                if not name:
                    continue
                p = room.add_player(name, is_host=False)
                # Form clean share URL
                share_url = f"{host_origin}/?room={code}&token={p.token}"
                player_links.append({
                    "name": p.name,
                    "token": p.token,
                    "avatar": p.avatar,
                    "url": share_url
                })

            self.rooms[code] = room

            host_link = f"{host_origin}/?room={code}&token={host_token}&role=host"
            return True, "Room created successfully!", {
                "roomCode": code,
                "hostToken": host_token,
                "hostLink": host_link,
                "gameType": game_type,
                "roundCount": len(questions),
                "playerLinks": player_links
            }

    def get_room(self, room_code):
        if not room_code:
            return None
        return self.rooms.get(room_code.upper().strip())

    def handle_ws_connection(self, sock, room_code, token):
        """
        Manages the persistent WebSocket lifecycle for a client.
        Reads client frames, dispatches room actions, and handles clean disconnect.
        """
        room = self.get_room(room_code)
        if not room:
            try:
                sock.sendall(make_ws_frame({"type": "ERROR", "message": "Room not found or expired."}))
                sock.close()
            except Exception:
                pass
            return

        player = room.get_player(token)
        if not player:
            try:
                sock.sendall(make_ws_frame({"type": "ERROR", "message": "Invalid player token."}))
                sock.close()
            except Exception:
                pass
            return

        # Bind active socket
        with player.lock:
            if player.sock and player.sock != sock:
                try:
                    player.sock.close()
                except Exception:
                    pass
            player.sock = sock
            player.connected = True

        print(f"🎮 [MULTIPLAYER JOIN] Room {room.code} | Player: {player.name} ({player.token}) connected!", flush=True)

        # Broadcast updated lobby to all
        room.broadcast(room.get_lobby_state())

        # If game is already active, send current active question immediately
        with room.lock:
            if room.status == "QUESTION_ACTIVE":
                q = room.questions[room.current_question_index]
                elapsed = time.time() - room.question_start_time
                rem_duration = max(1.0, room.question_duration - elapsed)
                player.send({
                    "type": "QUESTION_ACTIVE",
                    "roundIndex": room.current_question_index + 1,
                    "totalRounds": len(room.questions),
                    "gameType": room.game_type,
                    "prompt": q["prompt"],
                    "subtitle": q.get("subtitle", ""),
                    "mediaType": q.get("mediaType", ""),
                    "mediaUrl": q.get("mediaUrl", ""),
                    "introDuration": q.get("introDuration", 10.0),
                    "options": q["options"],
                    "duration": rem_duration,
                    "serverTime": time.time()
                })

        # Frame reading loop
        try:
            while True:
                opcode, text = read_ws_frame(sock)
                if opcode is None or opcode == 8:  # Close frame or disconnected
                    break
                if opcode == 9:  # Ping -> Pong
                    sock.sendall(bytes([0x8A, 0x00]))
                    continue
                if opcode == 1 and text:  # Text frame
                    try:
                        msg = json.loads(text)
                        action = msg.get("action")

                        if action == "ready":
                            player.ready = True
                            room.broadcast(room.get_lobby_state())

                        elif action == "start":
                            ok, errMsg = room.start_game(token)
                            if not ok:
                                player.send({"type": "ERROR", "message": errMsg})

                        elif action == "answer":
                            opt_idx = msg.get("optionIndex")
                            resp_ms = msg.get("responseTimeMs")
                            if opt_idx is not None:
                                ok, errMsg = room.submit_answer(token, int(opt_idx), resp_ms)
                                if not ok:
                                    player.send({"type": "ERROR", "message": errMsg})

                        elif action == "chat":
                            # Fun filmi quick emoji shoutouts
                            shout = msg.get("shout", "🔥")
                            room.broadcast({
                                "type": "PLAYER_SHOUT",
                                "playerName": player.name,
                                "avatar": player.avatar,
                                "shout": shout
                            })

                    except Exception as e:
                        print(f"⚠️ [MULTIPLAYER MSG ERR] {e}", flush=True)

        except Exception as e:
            print(f"⚠️ [MULTIPLAYER WS ERR] {e}", flush=True)
        finally:
            with player.lock:
                player.connected = False
                player.sock = None
            try:
                sock.close()
            except Exception:
                pass
            print(f"👋 [MULTIPLAYER LEAVE] Room {room.code} | Player: {player.name} disconnected.", flush=True)
            room.broadcast(room.get_lobby_state())


# Singleton instance
multiplayer_manager = MultiplayerManager()

