"""
YouTube audio for the guitar app: GET /audio?id=<video id> with "Authorization: Bearer <KEY>"
returns the video's audio (m4a when YouTube has it). Only YouTube video ids are accepted, so the
server can't be used to fetch arbitrary URLs. Personal use: one key, two downloads at a time.
"""

import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

KEY = os.environ.get("KEY", "")
PORT = int(os.environ.get("PORT", "8080"))
MAX_MINUTES = int(os.environ.get("MAX_MINUTES", "30"))
YTDLP = os.environ.get("YTDLP", "yt-dlp")
VIDEO_ID = re.compile(r"^[\w-]{11}$")
slots = threading.BoundedSemaphore(2)

TYPES = {"m4a": "audio/mp4", "webm": "audio/webm", "mp3": "audio/mpeg", "opus": "audio/ogg"}


def update_forever():
    """YouTube changes often; yt-dlp keeps up. Update at start and then daily."""
    while True:
        subprocess.run([YTDLP, "-U"], capture_output=True)
        time.sleep(24 * 3600)


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization")
        self.send_header("Access-Control-Expose-Headers", "X-Title")

    def fail(self, code, message):
        body = json.dumps({"error": message}, ensure_ascii=False).encode()
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Access-Control-Allow-Methods", "GET")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == "/health":
            self.send_response(200)
            self.cors()
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            return self.wfile.write(b"ok")
        if url.path != "/audio":
            return self.fail(404, "Нет такого адреса")
        if not KEY or self.headers.get("Authorization", "") != f"Bearer {KEY}":
            return self.fail(401, "Неверный ключ")
        video = urllib.parse.parse_qs(url.query).get("id", [""])[0]
        if not VIDEO_ID.match(video):
            return self.fail(400, "Нужен id видео YouTube")
        if not slots.acquire(timeout=60):
            return self.fail(503, "Сервер занят, попробуй через минуту")
        tmp = tempfile.mkdtemp()
        try:
            r = subprocess.run(
                [
                    YTDLP, "--no-playlist", "--quiet", "--no-warnings",
                    "-f", "bestaudio[ext=m4a]/bestaudio",
                    "--match-filter", f"duration <= {MAX_MINUTES * 60}",
                    "--max-filesize", "80M",
                    "--print", "after_move:%(title)s",
                    "-o", os.path.join(tmp, "audio.%(ext)s"),
                    f"https://www.youtube.com/watch?v={video}",
                ],
                capture_output=True, text=True, timeout=300,
            )
            files = os.listdir(tmp)
            if r.returncode != 0 or not files:
                reason = (r.stderr.strip().splitlines() or ["видео длиннее лимита или недоступно"])[-1]
                return self.fail(502, f"Не удалось скачать: {reason}")
            path = os.path.join(tmp, files[0])
            ext = files[0].rsplit(".", 1)[-1]
            size = os.path.getsize(path)
            self.send_response(200)
            self.cors()
            self.send_header("Content-Type", TYPES.get(ext, "application/octet-stream"))
            self.send_header("Content-Length", str(size))
            self.send_header("X-Title", urllib.parse.quote(r.stdout.strip() or video))
            self.end_headers()
            with open(path, "rb") as f:
                shutil.copyfileobj(f, self.wfile)
        except subprocess.TimeoutExpired:
            self.fail(504, "Скачивание заняло слишком долго")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
            slots.release()

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} {fmt % args}", flush=True)


if __name__ == "__main__":
    if not KEY:
        raise SystemExit("Задай KEY — без ключа сервер не запустится")
    threading.Thread(target=update_forever, daemon=True).start()
    print(f"listening on :{PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
