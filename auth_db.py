#!/usr/bin/env python3
"""
Bollywood Music Game - User Management, Authentication & Subscription Engine
Database schema, OTP management, session tokens, paywall rules, and admin analytics.
"""

import sqlite3
import os
import json
import secrets
import hashlib
import datetime
import random
import msg91_service

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "arcade.db")

PLAN_CONFIGS = {
    "1day": {
        "name": "1 Day Game Night Pass",
        "days": 1,
        "price": 499,
        "tagline": "24 Hours Unlimited Access"
    },
    "7days": {
        "name": "7 Days Party Week Pass",
        "days": 7,
        "price": 1999,
        "tagline": "1 Week Unlimited Access (Most Popular)"
    },
    "1month": {
        "name": "1 Month Bollywood VIP",
        "days": 30,
        "price": 4999,
        "tagline": "30 Days Full Access to All 7 Games"
    }
}

def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn

def hash_pin(pin):
    """Computes salted SHA-256 hash for 6-digit PIN."""
    if not pin:
        return ""
    return hashlib.sha256(f"bolly_salt_{str(pin).strip()}".encode("utf-8")).hexdigest()

def normalize_mobile(mobile):
    """Strips country code and special characters down to 10-digit Indian mobile."""
    m = str(mobile).strip().replace(" ", "").replace("-", "")
    if m.startswith("+91"):
        m = m[3:]
    elif m.startswith("91") and len(m) == 12:
        m = m[2:]
    elif m.startswith("0") and len(m) == 11:
        m = m[1:]
    return m

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Users Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mobile TEXT UNIQUE NOT NULL,
                name TEXT DEFAULT '',
                role TEXT DEFAULT 'user', -- 'user' | 'admin'
                plan TEXT DEFAULT 'free', -- 'free' | 'paid'
                subscription_plan TEXT DEFAULT NULL, -- '1day' | '7days' | '1month' | 'admin_override'
                subscription_started_at TEXT DEFAULT NULL,
                subscription_expires_at TEXT DEFAULT NULL,
                status TEXT DEFAULT 'active', -- 'active' | 'blocked'
                pin_hash TEXT DEFAULT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                last_login_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN pin_hash TEXT DEFAULT NULL")
        except Exception:
            pass

        # 2. OTP Verification Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS otps (
                mobile TEXT PRIMARY KEY,
                otp TEXT NOT NULL,
                req_id TEXT DEFAULT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        try:
            cursor.execute("ALTER TABLE otps ADD COLUMN req_id TEXT DEFAULT NULL")
        except Exception:
            pass

        # 3. User Sessions Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                expires_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # 4. Game Play Logs Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS game_plays (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                game_id TEXT NOT NULL, -- 'intro' | 'stanza' | 'still' | 'emoji' | 'lyrics' | 'dialogue' | 'clip'
                rounds_requested INTEGER DEFAULT 5,
                score INTEGER DEFAULT 0,
                played_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # 5. Subscriptions Ledger Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS subscriptions_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                plan TEXT NOT NULL,
                amount INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                payment_method TEXT DEFAULT 'UPI',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # 6. Pre-seed Default Super Admin (Gaurav: 9899259836, PIN: 757879)
        admin_mobile = "9899259836"
        admin_pin_hash = hash_pin("757879")
        now_iso = datetime.datetime.now().isoformat()
        ten_years_later = (datetime.datetime.now() + datetime.timedelta(days=3650)).isoformat()

        cursor.execute("SELECT id FROM users WHERE mobile = ?", (admin_mobile,))
        admin_row = cursor.fetchone()
        if not admin_row:
            cursor.execute("""
                INSERT INTO users (mobile, name, role, plan, subscription_plan, subscription_started_at, subscription_expires_at, pin_hash)
                VALUES (?, ?, 'admin', 'paid', 'admin_override', ?, ?, ?)
            """, (admin_mobile, "Super Admin (Gaurav)", now_iso, ten_years_later, admin_pin_hash))
            print(f"👑 Pre-seeded Super Admin account: Mobile {admin_mobile} (Role: admin, Plan: paid, PIN: 757879)")
        else:
            cursor.execute("""
                UPDATE users 
                SET role = 'admin',
                    plan = 'paid',
                    subscription_plan = 'admin_override',
                    subscription_expires_at = ?,
                    pin_hash = ?,
                    name = 'Super Admin (Gaurav)'
                WHERE mobile = ?
            """, (ten_years_later, admin_pin_hash, admin_mobile))
            print(f"👑 Updated Super Admin account: Mobile {admin_mobile} (Role: admin, Plan: paid, PIN: 757879)")

        # Demote old demo admin if exists
        cursor.execute("UPDATE users SET role = 'user' WHERE mobile = '9999999999'")

        conn.commit()


# ============================================================
# USER & SUBSCRIPTION LIFECYCLE
# ============================================================

def check_and_update_expiry(user):
    """
    Checks if a paid user's subscription has expired.
    If expired, immediately reverts their plan back to 'free' in the DB.
    """
    if not user:
        return user
    
    if user["plan"] == "paid" and user["subscription_expires_at"]:
        try:
            exp = datetime.datetime.fromisoformat(user["subscription_expires_at"])
            if datetime.datetime.now() > exp:
                with get_db() as conn:
                    conn.cursor().execute("""
                        UPDATE users 
                        SET plan = 'free', subscription_plan = NULL 
                        WHERE id = ?
                    """, (user["id"],))
                    conn.commit()
                # Return updated dict copy
                updated = dict(user)
                updated["plan"] = "free"
                updated["subscription_plan"] = None
                updated["is_expired"] = True
                return updated
        except Exception as e:
            print(f"Error checking expiry: {e}")

    return dict(user)

def get_user_by_id(user_id):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        if not row:
            return None
        return check_and_update_expiry(dict(row))

def get_user_by_mobile(mobile):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE mobile = ?", (mobile,))
        row = cursor.fetchone()
        if not row:
            return None
        return check_and_update_expiry(dict(row))

def get_user_by_token(token):
    if not token:
        return None
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.expires_at as session_expiry, u.*
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ?
        """, (token,))
        row = cursor.fetchone()
        if not row:
            return None
        
        # Check session expiry
        try:
            s_exp = datetime.datetime.fromisoformat(row["session_expiry"])
            if datetime.datetime.now() > s_exp:
                cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
                conn.commit()
                return None
        except Exception:
            pass

        return check_and_update_expiry(dict(row))

def get_user_game_plays(user_id):
    """Returns map of game_id -> count of games played by this user."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT game_id, COUNT(*) as play_count 
            FROM game_plays 
            WHERE user_id = ? 
            GROUP BY game_id
        """, (user_id,))
        return {r["game_id"]: r["play_count"] for r in cursor.fetchall()}


# ============================================================
# OTP & AUTHENTICATION
# ============================================================

def send_otp(mobile, name=""):
    """
    Generates an OTP for mobile number.
    If MSG91 is enabled, dispatches via MSG91 (WhatsApp-first / SMS).
    Otherwise, generates local OTP code for dev/offline testing.
    Returns (success, message, otp_code_for_dev).
    """
    mobile = normalize_mobile(mobile)

    if not (len(mobile) == 10 and mobile.isdigit()):
        return False, "Please enter a valid 10-digit Indian mobile number", None

    # Deterministic or dev OTP for super admin (4 digits)
    if mobile == "9999999999":
        otp = "1234"
        exp = (datetime.datetime.now() + datetime.timedelta(minutes=10)).isoformat()
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO otps (mobile, otp, req_id, expires_at)
                VALUES (?, ?, NULL, ?)
                ON CONFLICT(mobile) DO UPDATE SET otp = excluded.otp, req_id = NULL, expires_at = excluded.expires_at
            """, (mobile, otp, exp))
            conn.commit()
        return True, "Super Admin OTP ready (1234)", otp

    # Check if MSG91 is enabled and configured
    if msg91_service.is_msg91_configured():
        ok, msg, req_id = msg91_service.send_otp_via_msg91(mobile)
        if ok and req_id:
            exp = (datetime.datetime.now() + datetime.timedelta(minutes=15)).isoformat()
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO otps (mobile, otp, req_id, expires_at)
                    VALUES (?, 'MSG91', ?, ?)
                    ON CONFLICT(mobile) DO UPDATE SET otp = 'MSG91', req_id = excluded.req_id, expires_at = excluded.expires_at
                """, (mobile, req_id, exp))
                conn.commit()
            print(f"💬 [MSG91 OTP SENT] Mobile: {mobile} | ReqId: {req_id} via WhatsApp/SMS", flush=True)
            return True, "OTP sent successfully to your WhatsApp / Mobile via MSG91!", None
        else:
            print(f"⚠️ [MSG91 OTP FAILED] Mobile: {mobile} -> {msg}", flush=True)
            return False, f"Failed to send OTP via MSG91: {msg}", None

    # Fallback Dev Mode (4-digit Mock OTP)
    otp = f"{random.randint(1000, 9999)}"
    exp = (datetime.datetime.now() + datetime.timedelta(minutes=10)).isoformat()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO otps (mobile, otp, req_id, expires_at)
            VALUES (?, ?, NULL, ?)
            ON CONFLICT(mobile) DO UPDATE SET otp = excluded.otp, req_id = NULL, expires_at = excluded.expires_at
        """, (mobile, otp, exp))
        conn.commit()

    print(f"📱 [DEV OTP SENT] Mobile: {mobile} | OTP: {otp} | Exp: 10 mins", flush=True)
    return True, "OTP sent successfully to your mobile number!", otp

def verify_otp(mobile, otp, name=""):
    """
    Verifies 4-digit OTP, registers user if new, creates 30-day session token.
    Supports MSG91 remote verification as well as local fallback.
    Returns (success, message, session_token, user_dict, needs_pin).
    """
    mobile = normalize_mobile(mobile)
    otp = otp.strip()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT otp, req_id, expires_at FROM otps WHERE mobile = ?", (mobile,))
        row = cursor.fetchone()

        # Super Admin master bypass with dev/bypass codes
        if (mobile == "9899259836" and otp in ("7578", "757879", "1234", "123456")) or (mobile == "9999999999" and otp in ("1234", "123456")):
            pass  # always allowed
        elif not row:
            return False, "No active OTP found. Please click 'Send OTP' first.", None, None, False
        elif row["req_id"] and msg91_service.is_msg91_configured():
            # Verify OTP via MSG91 widget endpoint
            ok, msg, access_token = msg91_service.verify_otp_via_msg91(mobile, row["req_id"], otp)
            if not ok:
                return False, msg, None, None, False
        else:
            # Local code verification
            if row["otp"] != otp:
                return False, "Incorrect OTP. Please check and try again.", None, None, False

            # Check expiry
            try:
                if datetime.datetime.now() > datetime.datetime.fromisoformat(row["expires_at"]):
                    return False, "OTP has expired. Please request a new one.", None, None, False
            except Exception:
                pass

        # OTP verified! Delete used OTP
        cursor.execute("DELETE FROM otps WHERE mobile = ?", (mobile,))

        # Find or create user
        cursor.execute("SELECT * FROM users WHERE mobile = ?", (mobile,))
        user_row = cursor.fetchone()

        now_iso = datetime.datetime.now().isoformat()
        if not user_row:
            # New user registration: default role 'user', plan 'free'
            user_name = name.strip() if name and not name.strip().isdigit() else f"User {mobile[-4:]}"
            cursor.execute("""
                INSERT INTO users (mobile, name, role, plan, created_at, last_login_at)
                VALUES (?, ?, 'user', 'free', ?, ?)
            """, (mobile, user_name, now_iso, now_iso))
            user_id = cursor.lastrowid
            needs_pin = True
        else:
            user_id = user_row["id"]
            # Check if user needs to set a PIN
            needs_pin = not bool(user_row["pin_hash"])
            cleaned_name = name.strip() if name else ""
            if cleaned_name and not cleaned_name.isdigit():
                cursor.execute("UPDATE users SET last_login_at = ?, name = ? WHERE id = ?", (now_iso, cleaned_name, user_id))
            else:
                cursor.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now_iso, user_id))

        token = secrets.token_hex(32)
        session_exp = (datetime.datetime.now() + datetime.timedelta(days=30)).isoformat()

        cursor.execute("""
            INSERT INTO sessions (token, user_id, expires_at)
            VALUES (?, ?, ?)
        """, (token, user_id, session_exp))

        conn.commit()

    user = get_user_by_id(user_id)
    return True, "OTP verified successfully!", token, user, needs_pin


def check_mobile(mobile):
    """
    Checks if a mobile number is already registered and if they have set a 6-digit PIN.
    Returns (ok, message, data_dict).
    """
    mobile = normalize_mobile(mobile)
    if not (len(mobile) == 10 and mobile.isdigit()):
        return False, "Please enter a valid 10-digit Indian mobile number", None

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, mobile, name, role, plan, pin_hash FROM users WHERE mobile = ?", (mobile,))
        row = cursor.fetchone()
        if not row:
            return True, "New user", {"registered": False, "has_pin": False, "name": ""}

        has_pin = bool(row["pin_hash"])
        if mobile in ("9899259836", "9999999999"):
            has_pin = True

        return True, "User found", {
            "registered": True,
            "has_pin": has_pin,
            "name": row["name"] or ""
        }


def login_with_pin(mobile, pin):
    """
    Validates 6-digit PIN for an existing user.
    Returns (success, message, session_token, user_dict).
    """
    mobile = normalize_mobile(mobile)
    pin = str(pin).strip()
    if not (len(mobile) == 10 and mobile.isdigit()):
        return False, "Please enter a valid 10-digit Indian mobile number", None, None
    if len(pin) != 6 or not pin.isdigit():
        return False, "PIN must be exactly 6 digits", None, None

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE mobile = ?", (mobile,))
        row = cursor.fetchone()
        if not row:
            return False, "Account not found for this mobile number. Please sign up.", None, None

        # Super admin master bypass (PIN: 757879 for 9899259836, 123456 for 9999999999)
        if (mobile == "9899259836" and pin == "757879") or (mobile == "9999999999" and pin == "123456"):
            valid = True
        elif not row["pin_hash"]:
            return False, "No PIN set yet. Please verify via WhatsApp OTP to create your PIN.", None, None
        else:
            valid = (row["pin_hash"] == hash_pin(pin))

        if not valid:
            return False, "Incorrect 6-digit PIN. Please try again or click 'Forgot PIN?'.", None, None

        user_id = row["id"]
        now_iso = datetime.datetime.now().isoformat()
        cursor.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now_iso, user_id))

        token = secrets.token_hex(32)
        session_exp = (datetime.datetime.now() + datetime.timedelta(days=30)).isoformat()
        cursor.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", (token, user_id, session_exp))
        conn.commit()

    user = get_user_by_id(user_id)
    return True, "Login successful!", token, user


def set_user_pin(mobile, pin, name=""):
    """
    Sets or resets 6-digit PIN for a user after OTP verification.
    Returns (success, message, session_token, user_dict).
    """
    mobile = normalize_mobile(mobile)
    pin = str(pin).strip()
    if not (len(mobile) == 10 and mobile.isdigit()):
        return False, "Please enter a valid 10-digit Indian mobile number", None, None
    if len(pin) != 6 or not pin.isdigit():
        return False, "PIN must be exactly 6 digits", None, None

    h = hash_pin(pin)
    now_iso = datetime.datetime.now().isoformat()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE mobile = ?", (mobile,))
        row = cursor.fetchone()

        if not row:
            user_name = name.strip() if name and not name.strip().isdigit() else f"User {mobile[-4:]}"
            cursor.execute("""
                INSERT INTO users (mobile, name, role, plan, pin_hash, created_at, last_login_at)
                VALUES (?, ?, 'user', 'free', ?, ?, ?)
            """, (mobile, user_name, h, now_iso, now_iso))
            user_id = cursor.lastrowid
        else:
            user_id = row["id"]
            update_name = name.strip() if name and not name.strip().isdigit() else row["name"]
            cursor.execute("""
                UPDATE users SET pin_hash = ?, name = ?, last_login_at = ? WHERE id = ?
            """, (h, update_name, now_iso, user_id))

        token = secrets.token_hex(32)
        session_exp = (datetime.datetime.now() + datetime.timedelta(days=30)).isoformat()
        cursor.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", (token, user_id, session_exp))
        conn.commit()

    user = get_user_by_id(user_id)
    return True, "6-digit PIN saved successfully!", token, user


def admin_delete_user(admin_user_id, target_user_id):
    """
    Permanently deletes a user and associated data. Protected against deleting super admin.
    """
    admin = get_user_by_id(admin_user_id)
    if not admin or admin["role"] != "admin":
        return False, "Permission denied. Admin authorization required."

    target = get_user_by_id(target_user_id)
    if not target:
        return False, "Target user not found."

    if target["mobile"] in ("9899259836", "9999999999") or target["role"] == "admin":
        return False, "Cannot delete Super Admin account."

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sessions WHERE user_id = ?", (target_user_id,))
        cursor.execute("DELETE FROM game_plays WHERE user_id = ?", (target_user_id,))
        cursor.execute("DELETE FROM subscriptions_log WHERE user_id = ?", (target_user_id,))
        cursor.execute("DELETE FROM otps WHERE mobile = ?", (target["mobile"],))
        cursor.execute("DELETE FROM users WHERE id = ?", (target_user_id,))
        conn.commit()

    print(f"🗑️ [ADMIN DELETE] Admin {admin['mobile']} deleted user {target['mobile']} (ID: {target_user_id})", flush=True)
    return True, f"User {target['mobile']} deleted successfully."


def verify_msg91_access_token(access_token, name=""):
    """
    Verifies an access token issued by the MSG91 frontend widget.
    Calls MSG91 verifyAccessToken API, registers user if new, issues 30-day session token.
    Returns (success, message, session_token, user_dict).
    """
    ok, verified_mobile = msg91_service.verify_access_token_via_msg91(access_token)
    if not ok or not verified_mobile:
        return False, verified_mobile or "Invalid MSG91 access token", None, None

    mobile = verified_mobile.strip()
    if mobile.startswith("+91"):
        mobile = mobile[3:]
    elif mobile.startswith("91") and len(mobile) == 12:
        mobile = mobile[2:]

    now_iso = datetime.datetime.now().isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE mobile = ?", (mobile,))
        user_row = cursor.fetchone()

        if not user_row:
            user_name = name.strip() if name and not name.strip().isdigit() else f"User {mobile[-4:]}"
            cursor.execute("""
                INSERT INTO users (mobile, name, role, plan, created_at, last_login_at)
                VALUES (?, ?, 'user', 'free', ?, ?)
            """, (mobile, user_name, now_iso, now_iso))
            user_id = cursor.lastrowid
        else:
            user_id = user_row["id"]
            update_name = name.strip() if name and not name.strip().isdigit() else user_row["name"]
            cursor.execute("""
                UPDATE users SET last_login_at = ?, name = ? WHERE id = ?
            """, (now_iso, update_name, user_id))

        token = secrets.token_hex(32)
        session_exp = (datetime.datetime.now() + datetime.timedelta(days=30)).isoformat()
        cursor.execute("""
            INSERT INTO sessions (token, user_id, expires_at)
            VALUES (?, ?, ?)
        """, (token, user_id, session_exp))
        conn.commit()

    user = get_user_by_id(user_id)
    return True, "Login successful via MSG91 WhatsApp OTP!", token, user

def logout_session(token):
    if not token:
        return
    with get_db() as conn:
        conn.cursor().execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()


# ============================================================
# PAYWALL & GAME PLAY VALIDATION
# ============================================================

def record_game_play(user_id, game_id, rounds_requested):
    """
    Validates game launch against the user's plan:
    - Free user:
      * Can play each game once only.
      * Can play only up to 5 quizzes.
      * Otherwise rejected with upgrade requirement.
    - Paid user:
      * Unlimited access to all games and round counts.
    Returns (allowed: bool, code: str, message: str, meta: dict).
    """
    user = get_user_by_id(user_id)
    if not user:
        return False, "UNAUTHORIZED", "Please sign in to play", {}

    user_plan = user["plan"]
    game_plays = get_user_game_plays(user_id)
    plays_for_this_game = game_plays.get(game_id, 0)

    # 1. Paid User Check
    if user_plan == "paid":
        # Record play log
        with get_db() as conn:
            conn.cursor().execute("""
                INSERT INTO game_plays (user_id, game_id, rounds_requested)
                VALUES (?, ?, ?)
            """, (user_id, game_id, rounds_requested))
            conn.commit()
        return True, "SUCCESS", "Game started with PRO plan unlimited access!", {
            "plan": "paid",
            "subscription_expires_at": user["subscription_expires_at"]
        }

    # 2. Free User Rule 1: Max 5 quizzes only
    if rounds_requested > 5:
        return False, "UPGRADE_ROUNDS_LIMIT", (
            f"Free tier is limited to 5 quizzes per game. "
            f"Upgrade to a Paid Pass to unlock 10, 15, 20, 30, and All quizzes!"
        ), {
            "plan": "free",
            "game_id": game_id,
            "rounds_requested": rounds_requested,
            "max_free_rounds": 5
        }

    # 3. Free User Rule 2: Can play each game ONCE only
    if plays_for_this_game >= 1:
        return False, "UPGRADE_GAME_LIMIT", (
            f"You have already completed your 1 free trial round for this game! "
            f"Upgrade to a Paid Plan to get unlimited plays across all Bollywood games."
        ), {
            "plan": "free",
            "game_id": game_id,
            "plays_completed": plays_for_this_game,
            "total_games_played": len(game_plays)
        }

    # Free play allowed! Log it
    with get_db() as conn:
        conn.cursor().execute("""
            INSERT INTO game_plays (user_id, game_id, rounds_requested)
            VALUES (?, ?, ?)
        """, (user_id, game_id, rounds_requested))
        conn.commit()

    return True, "SUCCESS", "Free trial started! Enjoy your 5 quizzes.", {
        "plan": "free",
        "game_id": game_id,
        "is_free_trial": True
    }


# ============================================================
# SUBSCRIPTION UPGRADE ENGINE
# ============================================================

def upgrade_subscription(user_id, plan_id, payment_method="UPI"):
    """
    Upgrades user to a paid plan ('1day', '7days', '1month').
    Calculates duration, sets expiry, logs transaction.
    """
    if plan_id not in PLAN_CONFIGS:
        return False, f"Invalid plan: {plan_id}. Must be one of: {list(PLAN_CONFIGS.keys())}", None

    cfg = PLAN_CONFIGS[plan_id]
    days = cfg["days"]
    price = cfg["price"]

    now = datetime.datetime.now()
    # If user already has active paid subscription, extend from existing expiry date
    user = get_user_by_id(user_id)
    if user and user["plan"] == "paid" and user["subscription_expires_at"]:
        try:
            curr_exp = datetime.datetime.fromisoformat(user["subscription_expires_at"])
            if curr_exp > now:
                new_exp = curr_exp + datetime.timedelta(days=days)
            else:
                new_exp = now + datetime.timedelta(days=days)
        except Exception:
            new_exp = now + datetime.timedelta(days=days)
    else:
        new_exp = now + datetime.timedelta(days=days)

    now_iso = now.isoformat()
    new_exp_iso = new_exp.isoformat()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE users 
            SET plan = 'paid',
                subscription_plan = ?,
                subscription_started_at = ?,
                subscription_expires_at = ?
            WHERE id = ?
        """, (plan_id, now_iso, new_exp_iso, user_id))

        cursor.execute("""
            INSERT INTO subscriptions_log (user_id, plan, amount, started_at, expires_at, payment_method)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, plan_id, price, now_iso, new_exp_iso, payment_method))

        conn.commit()

    updated_user = get_user_by_id(user_id)
    print(f"💎 [SUBSCRIPTION UPGRADED] User {updated_user['mobile']} -> {cfg['name']} (Expires: {new_exp_iso})", flush=True)
    return True, f"Successfully upgraded to {cfg['name']}! All games are now unlocked.", updated_user


# ============================================================
# ADMIN MANAGEMENT & ANALYTICS
# ============================================================

def get_admin_dashboard_stats():
    """Compiles complete analytics: user counts, paid/free, revenue, game usage."""
    with get_db() as conn:
        cursor = conn.cursor()

        # 1. Total users
        cursor.execute("SELECT COUNT(*) as total FROM users")
        total_users = cursor.fetchone()["total"]

        # 2. Check active paid users (considering expiry)
        now_iso = datetime.datetime.now().isoformat()
        cursor.execute("""
            SELECT COUNT(*) as paid 
            FROM users 
            WHERE plan = 'paid' AND subscription_expires_at > ?
        """, (now_iso,))
        paid_users = cursor.fetchone()["paid"]

        free_users = max(0, total_users - paid_users)

        # 3. Total revenue from subscriptions log
        cursor.execute("SELECT COALESCE(SUM(amount), 0) as total_rev FROM subscriptions_log")
        total_revenue = cursor.fetchone()["total_rev"]

        # 4. Total games played
        cursor.execute("SELECT COUNT(*) as total_plays FROM game_plays")
        total_plays = cursor.fetchone()["total_plays"]

        # 5. Plays by game mode
        cursor.execute("""
            SELECT game_id, COUNT(*) as count 
            FROM game_plays 
            GROUP BY game_id 
            ORDER BY count DESC
        """)
        plays_by_game = {r["game_id"]: r["count"] for r in cursor.fetchall()}

        # 6. Breakdown by subscription plan
        cursor.execute("""
            SELECT plan, COUNT(*) as count, SUM(amount) as revenue 
            FROM subscriptions_log 
            GROUP BY plan
        """)
        plan_breakdown = {r["plan"]: {"count": r["count"], "revenue": r["revenue"]} for r in cursor.fetchall()}

        # 7. Recent activity (last 10 game plays or upgrades)
        cursor.execute("""
            SELECT gp.game_id, gp.rounds_requested, gp.played_at, u.mobile, u.name, u.plan 
            FROM game_plays gp
            JOIN users u ON gp.user_id = u.id
            ORDER BY gp.id DESC LIMIT 10
        """)
        recent_plays = [dict(r) for r in cursor.fetchall()]

        return {
            "total_users": total_users,
            "paid_users": paid_users,
            "free_users": free_users,
            "total_revenue": total_revenue,
            "total_plays": total_plays,
            "plays_by_game": plays_by_game,
            "plan_breakdown": plan_breakdown,
            "recent_plays": recent_plays,
            "plans_available": PLAN_CONFIGS
        }

def get_admin_user_list(search_query="", plan_filter="all", limit=100):
    """Returns list of users with their details, plays, and status for Admin Table."""
    with get_db() as conn:
        cursor = conn.cursor()
        
        query = "SELECT * FROM users WHERE 1=1"
        params = []

        if search_query:
            query += " AND (mobile LIKE ? OR name LIKE ?)"
            params.extend([f"%{search_query}%", f"%{search_query}%"])

        if plan_filter in ("free", "paid"):
            query += " AND plan = ?"
            params.append(plan_filter)

        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)

        cursor.execute(query, params)
        raw_users = cursor.fetchall()

        results = []
        now = datetime.datetime.now()

        for u in raw_users:
            u_dict = check_and_update_expiry(dict(u))
            user_id = u_dict["id"]
            
            # Count games played
            cursor.execute("SELECT COUNT(*) as c FROM game_plays WHERE user_id = ?", (user_id,))
            plays_count = cursor.fetchone()["c"]
            u_dict["plays_count"] = plays_count

            # Days remaining on subscription
            if u_dict["plan"] == "paid" and u_dict["subscription_expires_at"]:
                try:
                    exp_dt = datetime.datetime.fromisoformat(u_dict["subscription_expires_at"])
                    rem = exp_dt - now
                    if rem.total_seconds() > 0:
                        days = rem.days
                        hours = int(rem.seconds // 3600)
                        u_dict["remaining_time"] = f"{days}d {hours}h" if days > 0 else f"{hours}h {int((rem.seconds % 3600)//60)}m"
                    else:
                        u_dict["remaining_time"] = "Expired"
                except Exception:
                    u_dict["remaining_time"] = "-"
            else:
                u_dict["remaining_time"] = "-"

            results.append(u_dict)

        return results

def admin_update_user(admin_user_id, target_user_id, new_plan=None, custom_days=None, new_role=None, new_status=None):
    """
    Admin action to modify any user's plan, subscription duration, role, or status.
    """
    admin = get_user_by_id(admin_user_id)
    if not admin or admin["role"] != "admin":
        return False, "Permission denied. Admin role required."

    target = get_user_by_id(target_user_id)
    if not target:
        return False, "Target user not found."

    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Update Plan
        if new_plan == "free":
            cursor.execute("""
                UPDATE users 
                SET plan = 'free', subscription_plan = NULL, subscription_expires_at = NULL 
                WHERE id = ?
            """, (target_user_id,))
        elif new_plan == "paid":
            days = int(custom_days) if custom_days else 1
            now = datetime.datetime.now()
            # If user already has an active future subscription, extend from that point
            curr_exp = None
            if target.get("subscription_expires_at"):
                try:
                    curr_exp = datetime.datetime.fromisoformat(target["subscription_expires_at"])
                except Exception:
                    curr_exp = None

            base_time = curr_exp if (curr_exp and curr_exp > now) else now
            new_exp = base_time + datetime.timedelta(days=days)
            plan_name = "admin_1day_free" if days == 1 else "admin_override"
            payment_label = "Admin Free 1-Day Pass" if days == 1 else f"Admin Grant ({days}d)"

            cursor.execute("""
                UPDATE users 
                SET plan = 'paid', 
                    subscription_plan = ?,
                    subscription_started_at = ?,
                    subscription_expires_at = ?
                WHERE id = ?
            """, (plan_name, now.isoformat(), new_exp.isoformat(), target_user_id))

            # Record in ledger for audit
            cursor.execute("""
                INSERT INTO subscriptions_log (user_id, plan, amount, started_at, expires_at, payment_method)
                VALUES (?, ?, 0, ?, ?, ?)
            """, (target_user_id, plan_name, now.isoformat(), new_exp.isoformat(), payment_label))

        # 2. Update Role
        if new_role in ("user", "admin"):
            cursor.execute("UPDATE users SET role = ? WHERE id = ?", (new_role, target_user_id))

        # 3. Update Status
        if new_status in ("active", "blocked"):
            cursor.execute("UPDATE users SET status = ? WHERE id = ?", (new_status, target_user_id))

        conn.commit()

    updated = get_user_by_id(target_user_id)
    return True, f"User {updated['mobile']} successfully updated!", updated


# Initialize database automatically when imported
init_db()

if __name__ == "__main__":
    print("Testing auth_db.py self-test...")
    stats = get_admin_dashboard_stats()
    print(f"Stats: {stats['total_users']} users, {stats['paid_users']} paid, {stats['total_plays']} plays.")
    print("Self-test passed!")
