#!/usr/bin/env python3
"""
Bollywood Music Quiz Server
- HTTP Range requests for seamless audio seeking
- Client identification logging: IP, Location, Device type & Browser
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
        ip = self.get_client_ip()
        device = get_device_info(self.headers.get('User-Agent', ''))
        location = get_location_info(ip)
        now = datetime.datetime.now().strftime('%H:%M:%S')

        # Format status code and path
        code = str(args[1]) if len(args) > 1 else "---"
        path = args[0] if len(args) > 0 else self.path

        # Ignore noise for favicon or devtools
        if "favicon.ico" in path or ".well-known" in path:
            return

        # Friendly tag for song streaming
        extra = ""
        if "/songs/" in path:
            song_name = path.split("/songs/")[-1].split("?")[0].split(" HTTP")[0]
            song_name = urllib.parse.unquote(song_name)
            extra = f" 🎶 [Song: {song_name}]"

        # ANSI Colors
        GREEN = "\033[92m"
        CYAN = "\033[96m"
        YELLOW = "\033[93m"
        MAGENTA = "\033[95m"
        GRAY = "\033[90m"
        WHITE = "\033[97m"
        RESET = "\033[0m"

        print(f"{GRAY}[{now}]{RESET} {CYAN}{device:18}{RESET} | {YELLOW}IP: {ip:<15}{RESET} ({WHITE}{location}{RESET}) | {GREEN}{code}{RESET} {path}{MAGENTA}{extra}{RESET}", flush=True)

    def do_GET(self):
        # Check if this is a range request
        range_header = self.headers.get('Range')
        if range_header:
            self.handle_range_request(range_header)
        else:
            super().do_GET()

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
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Range, Content-Type')
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
