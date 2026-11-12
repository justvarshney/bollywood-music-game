#!/usr/bin/env python3
"""
Bollywood Music Quiz Server
- HTTP Range requests for seamless audio seeking
- Client identification logging: IP, Location, Device type & Browser
- User Management, Mobile OTP Authentication, Subscription Paywall & Admin APIs
- CORS & Cache-Control headers
"""

import http.server
import os
import re
import sys
import datetime
import socket
import json
import urllib.request
import urllib.parse
import threading

import auth_db
import msg91_service

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

# In-memory cache for IP Geo-location lookups
GEO_CACHE = {}

def get_device_info(user_agent):
    """Extract human-readable device and browser summary from User-Agent."""
    if not user_agent:
        return "Unknown Device"
    
    ua = user_agent.lower()
    
    # Device / OS
    if "iphone" in ua:
        os_info = "📱 iPhone"
    elif "ipad" in ua:
        os_info = "📱 iPad"
    elif "android" in ua:
        os_info = "📱 Android"
    elif "macintosh" in ua or "mac os" in ua:
        os_info = "💻 Mac"
    elif "windows" in ua:
        os_info = "💻 Windows"
    elif "linux" in ua:
        os_info = "🐧 Linux"
    else:
        os_info = "🌐 Client"

    # Browser
    if "edg" in ua:
        browser = "Edge"
    elif "chrome" in ua and "crios" not in ua:
        browser = "Chrome"
    elif "safari" in ua and "chrome" not in ua:
        browser = "Safari"
    elif "firefox" in ua or "fxios" in ua:
        browser = "Firefox"
    else:
        browser = "Browser"

    return f"{os_info} ({browser})"

def get_location_info(ip):
    """Determine if IP is localhost, local Wi-Fi LAN, or resolve Public GeoIP."""
    if ip in ("127.0.0.1", "::1", "localhost"):
        return "Localhost (Host Machine)"
    
    # Private / Local Network IP ranges
    if ip.startswith(("192.168.", "10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.")):
        return "Local Wi-Fi Network"

    # Check cache for public IP
    if ip in GEO_CACHE:
        return GEO_CACHE[ip]

    # Non-blocking async Geo lookup for public/remote IPs
    def fetch_geo():
        try:
            url = f"http://ip-api.com/json/{ip}?fields=status,country,regionName,city"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                if data.get('status') == 'success':
                    city = data.get('city', '')
                    country = data.get('country', '')
                    loc = f"{city}, {country}".strip(', ')
                    GEO_CACHE[ip] = loc
        except Exception:
            GEO_CACHE[ip] = "External Network"

    threading.Thread(target=fetch_geo, daemon=True).start()
    return GEO_CACHE.get(ip, "Resolving Location...")

def get_local_ip():
    """Find local LAN IP address for sharing on Wi-Fi."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


class RangeHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP handler that supports Range requests and client identification logging."""

    def get_client_ip(self):
        """Extract client IP taking proxies/tunnels into account."""
        forwarded = self.headers.get('X-Forwarded-For')
        if forwarded:
            return forwarded.split(',')[0].strip()
        real_ip = self.headers.get('X-Real-IP')
        if real_ip:
            return real_ip.strip()
        return self.client_address[0] if self.client_address else "127.0.0.1"

    def log_message(self, format, *args):
        """Custom clean, colorized logging with IP, Location, Device & Resource."""
        try:
            ip = self.get_client_ip()
            device = get_device_info(self.headers.get('User-Agent', '') if hasattr(self, 'headers') and self.headers else '')
            location = get_location_info(ip)
            now = datetime.datetime.now().strftime('%H:%M:%S')

            # Extract path safely
            path = str(self.path) if hasattr(self, 'path') and self.path else ""
            if not path and args and isinstance(args[0], str):
                path = args[0]

            # Ignore noise for devtools
            if ".well-known" in path:
                return

            # Determine status code safely
            code = "---"
            if len(args) >= 2 and str(args[1]).isdigit():
                code = str(args[1])
            elif len(args) >= 1 and hasattr(args[0], 'value'):
                code = str(args[0].value)
            elif len(args) >= 1 and str(args[0]).isdigit():
                code = str(args[0])

            # Friendly tag for audio streaming
            extra = ""
            if "/songs/" in path:
                song_name = path.split("/songs/")[-1].split("?")[0].split(" HTTP")[0]
                song_name = urllib.parse.unquote(song_name)
                extra = f" 🎶 [Song: {song_name}]"
            elif "/dialogues/" in path:
                dialogue_name = path.split("/dialogues/")[-1].split("?")[0].split(" HTTP")[0]
                dialogue_name = urllib.parse.unquote(dialogue_name)
                extra = f" 🗣️ [Dialogue: {dialogue_name}]"

            # ANSI Colors
            GREEN = "\033[92m" if code.startswith(('2', '3')) else "\033[91m"
            CYAN = "\033[96m"
            YELLOW = "\033[93m"
            MAGENTA = "\033[95m"
            GRAY = "\033[90m"
            WHITE = "\033[97m"
            RESET = "\033[0m"

            print(f"{GRAY}[{now}]{RESET} {CYAN}{device:18}{RESET} | {YELLOW}IP: {ip:<15}{RESET} ({WHITE}{location}{RESET}) | {GREEN}{code}{RESET} {path}{MAGENTA}{extra}{RESET}", flush=True)
        except Exception:
            super().log_message(format, *args)

    def send_json(self, status_code, payload):
        """Helper to return JSON response with proper headers."""
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def get_bearer_token(self):
        """Extract session token from Authorization header or custom header."""
        auth_hdr = self.headers.get('Authorization', '')
        if auth_hdr.startswith('Bearer '):
            return auth_hdr[7:].strip()
        custom = self.headers.get('X-Auth-Token', '')
        if custom:
            return custom.strip()
        return None

    def get_authenticated_user(self):
        """Resolves user from token, automatically checking subscription expiration."""
        token = self.get_bearer_token()
        if not token:
            return None
        return auth_db.get_user_by_token(token)

    def read_json_body(self):
        """Safely parse incoming JSON body."""
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length == 0:
                return {}
            raw = self.rfile.read(length).decode('utf-8')
            return json.loads(raw)
        except Exception:
            return {}

    def do_GET(self):
        # Serve favicon.ico safely if requested
        if self.path == '/favicon.ico' and not os.path.isfile('favicon.ico'):
            self.send_response(204)
            self.end_headers()
            return

        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # ----------------------------------------------------
        # REST API GET Routes
        # ----------------------------------------------------
        if path.startswith('/api/'):
            # 1. Current User Profile
            if path == '/api/auth/me':
                user = self.get_authenticated_user()
                if not user:
                    self.send_json(401, {"status": "error", "message": "Not authenticated", "user": None})
                    return
                plays = auth_db.get_user_game_plays(user["id"])
                self.send_json(200, {
                    "status": "success",
                    "user": user,
                    "game_plays": plays,
                    "plans": auth_db.PLAN_CONFIGS
                })
                return

            # 2. Available Subscription Plans
            elif path == '/api/subscription/plans':
                self.send_json(200, {
                    "status": "success",
                    "plans": auth_db.PLAN_CONFIGS
                })
                return

            # 3. Admin: Dashboard Stats & Analytics
            elif path == '/api/admin/stats':
                user = self.get_authenticated_user()
                if not user or user.get("role") != "admin":
                    self.send_json(403, {"status": "error", "message": "Admin authorization required"})
                    return
                stats = auth_db.get_admin_dashboard_stats()
                self.send_json(200, {"status": "success", "stats": stats})
                return

            # 4. Admin: User List
            elif path == '/api/admin/users':
                user = self.get_authenticated_user()
                if not user or user.get("role") != "admin":
                    self.send_json(403, {"status": "error", "message": "Admin authorization required"})
                    return
                q = query.get("q", [""])[0]
                plan_filter = query.get("plan", ["all"])[0]
                limit = int(query.get("limit", [100])[0])
                users = auth_db.get_admin_user_list(search_query=q, plan_filter=plan_filter, limit=limit)
                self.send_json(200, {"status": "success", "users": users})
                return

            # 5. Public MSG91 Client Config
            elif path == '/api/auth/msg91-config':
                cfg = msg91_service.get_public_client_config()
                self.send_json(200, {"status": "success", "config": cfg})
                return

            # 6. Admin: MSG91 Settings
            elif path == '/api/admin/msg91-settings':
                user = self.get_authenticated_user()
                if not user or user.get("role") != "admin":
                    self.send_json(403, {"status": "error", "message": "Admin authorization required"})
                    return
                settings = msg91_service.get_admin_masked_config()
                self.send_json(200, {"status": "success", "settings": settings, "config": settings})
                return

            else:
                self.send_json(404, {"status": "error", "message": f"API endpoint not found: {path}"})
                return

        # Check if this is a range request for media streaming
        range_header = self.headers.get('Range')
        if range_header:
            self.handle_range_request(range_header)
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if not path.startswith('/api/'):
            self.send_error(404, 'Endpoint not found')
            return

        body = self.read_json_body()

        # ----------------------------------------------------
        # REST API POST Routes
        # ----------------------------------------------------
        # 0. Check Mobile: Determines if user exists and if PIN is configured
        if path == '/api/auth/check-mobile':
            mobile = body.get('mobile', '')
            ok, msg, data = auth_db.check_mobile(mobile)
            self.send_json(200 if ok else 400, {
                "status": "success" if ok else "error",
                "message": msg,
                "data": data
            })
            return

        # 0.1 Login with 6-Digit PIN
        elif path == '/api/auth/login-pin':
            mobile = body.get('mobile', '')
            pin = body.get('pin', '')
            ok, msg, token, user = auth_db.login_with_pin(mobile, pin)
            if ok:
                plays = auth_db.get_user_game_plays(user["id"])
                self.send_json(200, {
                    "status": "success",
                    "message": msg,
                    "token": token,
                    "user": user,
                    "game_plays": plays
                })
            else:
                self.send_json(400, {"status": "error", "message": msg})
            return

        # 0.2 Set / Reset 6-Digit PIN
        elif path == '/api/auth/set-pin':
            mobile = body.get('mobile', '')
            pin = body.get('pin', '')
            name = body.get('name', '')
            ok, msg, token, user = auth_db.set_user_pin(mobile, pin, name)
            if ok:
                plays = auth_db.get_user_game_plays(user["id"])
                self.send_json(200, {
                    "status": "success",
                    "message": msg,
                    "token": token,
                    "user": user,
                    "game_plays": plays
                })
            else:
                self.send_json(400, {"status": "error", "message": msg})
            return

        # 1. Send OTP for Mobile Signup / Login / PIN Reset
        elif path == '/api/auth/send-otp':
            mobile = body.get('mobile', '')
            name = body.get('name', '')
            ok, msg, dev_otp = auth_db.send_otp(mobile, name)
            self.send_json(200 if ok else 400, {
                "status": "success" if ok else "error",
                "message": msg,
                "dev_otp": dev_otp
            })
            return

        # 2. Verify OTP & Issue Session Token
        elif path == '/api/auth/verify-otp':
            mobile = body.get('mobile', '')
            otp = body.get('otp', '')
            name = body.get('name', '')
            ok, msg, token, user, needs_pin = auth_db.verify_otp(mobile, otp, name)
            if ok:
                plays = auth_db.get_user_game_plays(user["id"])
                self.send_json(200, {
                    "status": "success",
                    "message": msg,
                    "token": token,
                    "user": user,
                    "needs_pin": needs_pin,
                    "game_plays": plays
                })
            else:
                self.send_json(400, {"status": "error", "message": msg})
            return

        # 3. Logout
        elif path == '/api/auth/logout':
            token = self.get_bearer_token()
            auth_db.logout_session(token)
            self.send_json(200, {"status": "success", "message": "Logged out successfully"})
            return

        # 4. Record Game Play & Enforce Free / Paid Paywall Rules
        elif path == '/api/game/record-play':
            user = self.get_authenticated_user()
            if not user:
                self.send_json(401, {
                    "status": "error",
                    "code": "UNAUTHORIZED",
                    "message": "Please sign in with your mobile number to play!"
                })
                return

            game_id = body.get('gameId', '')
            rounds = int(body.get('rounds', 5))

            allowed, code, msg, meta = auth_db.record_game_play(user["id"], game_id, rounds)
            if allowed:
                updated_user = auth_db.get_user_by_id(user["id"])
                plays = auth_db.get_user_game_plays(user["id"])
                self.send_json(200, {
                    "status": "success",
                    "allowed": True,
                    "message": msg,
                    "meta": meta,
                    "user": updated_user,
                    "game_plays": plays
                })
            else:
                self.send_json(403, {
                    "status": "error",
                    "code": code,
                    "allowed": False,
                    "message": msg,
                    "meta": meta
                })
            return

        # 5. Upgrade Subscription to Paid Plan
        elif path == '/api/subscription/upgrade':
            user = self.get_authenticated_user()
            if not user:
                self.send_json(401, {"status": "error", "message": "Please sign in to upgrade"})
                return

            plan_id = body.get('plan', '')
            payment_method = body.get('paymentMethod', 'UPI')
            ok, msg, updated_user = auth_db.upgrade_subscription(user["id"], plan_id, payment_method)
            self.send_json(200 if ok else 400, {
                "status": "success" if ok else "error",
                "message": msg,
                "user": updated_user
            })
            return

        # 6. Admin Action: Modify Any User's Plan, Role, or Status
        elif path == '/api/admin/update-user':
            admin_user = self.get_authenticated_user()
            if not admin_user or admin_user.get("role") != "admin":
                self.send_json(403, {"status": "error", "message": "Admin authorization required"})
                return

            target_id = body.get('targetUserId')
            new_plan = body.get('plan')
            custom_days = body.get('customDays')
            new_role = body.get('role')
            new_status = body.get('status')

            ok, msg, updated = auth_db.admin_update_user(
                admin_user_id=admin_user["id"],
                target_user_id=target_id,
                new_plan=new_plan,
                custom_days=custom_days,
                new_role=new_role,
                new_status=new_status
            )
            self.send_json(200 if ok else 400, {
                "status": "success" if ok else "error",
                "message": msg,
                "user": updated
            })
            return

        # 7. Verify Client MSG91 Widget Access Token
        elif path == '/api/auth/msg91-verify-token':
            access_token = body.get('accessToken', '')
            name = body.get('name', '')
            ok, msg, token, user = auth_db.verify_msg91_access_token(access_token, name)
            if ok:
                plays = auth_db.get_user_game_plays(user["id"])
                self.send_json(200, {
                    "status": "success",
                    "message": msg,
                    "token": token,
                    "user": user,
                    "game_plays": plays
                })
            else:
                self.send_json(400, {"status": "error", "message": msg})
            return

        # 8. Admin Save MSG91 Settings
        elif path == '/api/admin/msg91-settings':
            admin_user = self.get_authenticated_user()
            if not admin_user or admin_user.get("role") != "admin":
                self.send_json(403, {"status": "error", "message": "Admin authorization required"})
                return

            ok, msg = msg91_service.save_config(body)
            masked = msg91_service.get_admin_masked_config()
            self.send_json(200 if ok else 400, {
                "status": "success" if ok else "error",
                "message": msg,
                "settings": masked,
                "config": masked
            })
            return

        # 9. Admin Test MSG91 WhatsApp OTP
        elif path == '/api/admin/msg91-test':
            admin_user = self.get_authenticated_user()
            if not admin_user or admin_user.get("role") != "admin":
                self.send_json(403, {"status": "error", "message": "Admin authorization required"})
                return

            test_mobile = body.get('mobile', admin_user.get('mobile', ''))
            ok, msg, req_id = msg91_service.send_otp_via_msg91(test_mobile)
            self.send_json(200 if ok else 400, {
                "status": "success" if ok else "error",
                "success": ok,
                "message": msg,
                "req_id": req_id,
                "reqId": req_id
            })
            return

        # 10. Admin Delete User
        elif path == '/api/admin/delete-user':
            admin_user = self.get_authenticated_user()
            if not admin_user or admin_user.get("role") != "admin":
                self.send_json(403, {"status": "error", "message": "Admin authorization required"})
                return

            target_user_id = int(body.get('targetUserId', 0))
            ok, msg = auth_db.admin_delete_user(admin_user["id"], target_user_id)
            self.send_json(200 if ok else 400, {
                "status": "success" if ok else "error",
                "message": msg
            })
            return

        else:
            self.send_json(404, {"status": "error", "message": f"API endpoint not found: {path}"})
            return

    def handle_range_request(self, range_header):
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            self.send_error(404, 'File not found')
            return

        file_size = os.path.getsize(path)

        match = re.match(r'bytes=(\d+)-(\d*)', range_header)
        if not match:
            self.send_error(416, 'Invalid Range')
            return

        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else file_size - 1

        if start >= file_size:
            self.send_error(416, 'Range Not Satisfiable')
            return

        end = min(end, file_size - 1)
        content_length = end - start + 1

        content_type = self.guess_type(path)
        if content_type is None:
            content_type = 'application/octet-stream'

        # Send 206 Partial Content
        self.send_response(206)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(content_length))
        self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
        self.end_headers()

        # Stream requested chunk
        with open(path, 'rb') as f:
            f.seek(start)
            remaining = content_length
            buf_size = 64 * 1024
            while remaining > 0:
                chunk = f.read(min(buf_size, remaining))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except BrokenPipeError:
                    break
                remaining -= len(chunk)

    def do_HEAD(self):
        """Handle HEAD requests."""
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            index_path = os.path.join(path, 'index.html')
            if os.path.isfile(index_path):
                path = index_path
        if os.path.isfile(path):
            file_size = os.path.getsize(path)
            content_type = self.guess_type(path)
            if content_type is None:
                content_type = 'application/octet-stream'
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(file_size))
            self.end_headers()
        else:
            self.send_error(404, 'File not found')

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.end_headers()

    def end_headers(self):
        # Range support and CORS
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST')
        self.send_header('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization, X-Auth-Token')
        # Prevent caching for instant updates
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    handler = RangeHTTPRequestHandler
    server = http.server.HTTPServer(('', PORT), handler)
    local_ip = get_local_ip()

    print('\n' + '='*65, flush=True)
    print('🎬  BOLLYWOOD 90\'s MUSIC QUIZ SERVER', flush=True)
    print('='*65, flush=True)
    print(f'💻  Host Laptop:     http://localhost:{PORT}', flush=True)
    print(f'📱  Mobile on Wi-Fi: http://{local_ip}:{PORT}', flush=True)
    print(f'📡  User Tracking:   ✅ IP, Device & Location Logging Active', flush=True)
    print('='*65 + '\n', flush=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n👋 Server stopped.', flush=True)
        server.server_close()
