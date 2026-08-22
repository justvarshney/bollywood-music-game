#!/usr/bin/env python3
"""
Simple HTTP server with Range request support.
Required for audio seeking (audio.currentTime) to work in the browser.
"""

import http.server
import os
import re
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

class RangeHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP handler that supports Range requests for audio/video seeking."""

    def do_GET(self):
        # Check if this is a range request
        range_header = self.headers.get('Range')
        if range_header:
            self.handle_range_request(range_header)
        else:
            super().do_GET()

    def handle_range_request(self, range_header):
        # Parse the file path
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            self.send_error(404, 'File not found')
            return

        file_size = os.path.getsize(path)

        # Parse Range header: "bytes=START-END"
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

        # Determine content type
        content_type = self.guess_type(path)
        if content_type is None:
            content_type = 'application/octet-stream'

        # Send 206 Partial Content
        self.send_response(206)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(content_length))
        self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
        self.end_headers()

        # Send the requested byte range
        with open(path, 'rb') as f:
            f.seek(start)
            remaining = content_length
            buf_size = 64 * 1024  # 64KB chunks
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
        """Handle HEAD requests with Accept-Ranges header."""
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
        # Always advertise Range support and CORS
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Range, Content-Type')
        super().end_headers()


if __name__ == '__main__':
    handler = RangeHTTPRequestHandler
    server = http.server.HTTPServer(('', PORT), handler)
    print(f'🎵 Music Quiz Server running at http://localhost:{PORT}')
    print(f'   Serving from: {os.getcwd()}')
    print(f'   Range requests: ✅ Enabled (audio seeking works)')
    print(f'   Press Ctrl+C to stop')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n👋 Server stopped.')
        server.server_close()
