#!/usr/bin/env python3
"""server.py — Nephron backend.

Serves the static app AND a small JSON API from one origin (so it drops
straight behind a Cloudflare tunnel with no CORS). The deck lives in a
JSON file (DATA_PATH) that the server validates and writes atomically —
this is the "database". Pure Python stdlib, no dependencies.

The app shell/assets are open (so the login screen can render); the deck data and
all writes require a signed session cookie obtained via /api/login.

Endpoints
  GET  /                     -> the app (nephrology-study.html)      [open]
  GET  /assets/...           -> static assets                        [open]
  POST /api/login            -> { user, password } -> sets session cookie
  POST /api/logout           -> clears the session cookie
  GET  /api/health           -> { ok, backend, authRequired, authed, topics? }   [open]
  GET  /api/deck             -> the live deck                        [session]
  GET  /data.json            -> live deck (legacy fallback)          [session]
  POST /api/validate         -> raw JSON text -> { ok, errors, warnings, summary }  [session, no write]
  POST /api/ingest?mode=merge|replace
                             -> raw JSON text -> validate, merge, write  [session]

Env / args
  --data / DATA_PATH   path to the deck file        (default ./data.json)
  --port / PORT        listen port                  (default 8973)
  --host / HOST        bind address                 (default 0.0.0.0)
  AUTH_USER            login username               (default 'admin')
  AUTH_PASSWORD        login password               (auto-generated + logged if unset)
"""
import argparse
import hashlib
import hmac
import json
import os
import secrets
import shutil
import sys
import tempfile
import threading
import time
import urllib.parse
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import merge_engine as ME

APP_DIR = os.path.dirname(os.path.abspath(__file__))
SEED = os.path.join(APP_DIR, "data.json")
MIME = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
    ".woff": "font/woff", ".woff2": "font/woff2", ".map": "application/json",
    ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
}

CFG = None
AUTH_USER = "admin"
AUTH_PASSWORD = ""       # resolved in main(): AUTH_PASSWORD env, else persisted/generated
AUTH_SRC = ""
SESSION_SECRET = ""      # HMAC key for signing session cookies (persisted)
LOCK = threading.Lock()
MAX_BODY = 5 * 1024 * 1024      # 5 MB cap on request bodies
SESSION_NAME = "nephron_session"
SESSION_TTL_LONG = 30 * 24 * 3600   # "remember me" ticked — ~30 days per device
SESSION_TTL_SHORT = 8 * 3600        # unticked — a working session (~8 hours)


class TooLarge(Exception):
    pass


def _secret_beside_deck(name, nbytes):
    """Return a stable secret persisted next to the deck (0600), or an
    ephemeral one if the directory isn't writable."""
    path = os.path.join(os.path.dirname(os.path.abspath(CFG.data)) or ".", name)
    try:
        if os.path.exists(path):
            with open(path) as f:
                v = f.read().strip()
            if v:
                return v, "file"
        v = secrets.token_urlsafe(nbytes)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(v + "\n")
        return v, "generated"
    except OSError:
        return secrets.token_urlsafe(nbytes), "ephemeral"


def resolve_auth():
    """Secure by default. Username from AUTH_USER (default 'admin'); password
    from AUTH_PASSWORD, else a persisted/generated one. Login is always on."""
    user = os.environ.get("AUTH_USER", "").strip() or "admin"
    pw = os.environ.get("AUTH_PASSWORD", "").strip()
    if pw:
        return user, pw, "env"
    pw, src = _secret_beside_deck(".auth_password", 12)
    return user, pw, src


# ---- signed, stateless session cookies (survive restart; no server store) ----
def _sign(msg):
    return hmac.new(SESSION_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()


def make_session(ttl):
    exp = str(int(time.time()) + ttl)
    return "v1.%s.%s" % (exp, _sign("v1." + exp))


def valid_session(value):
    try:
        ver, exp, sig = value.split(".")
        if ver != "v1" or not hmac.compare_digest(sig, _sign("v1." + exp)):
            return False
        return int(exp) > time.time()
    except (ValueError, AttributeError):
        return False


def config():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.environ.get("DATA_PATH", SEED))
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8973")))
    ap.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    return ap.parse_args()


def seed_if_missing():
    """First run on a fresh volume: copy the baked-in seed deck into place."""
    if os.path.exists(CFG.data):
        return
    os.makedirs(os.path.dirname(CFG.data) or ".", exist_ok=True)
    if os.path.exists(SEED) and os.path.abspath(SEED) != os.path.abspath(CFG.data):
        shutil.copyfile(SEED, CFG.data)
    else:
        with open(CFG.data, "w", encoding="utf-8") as f:
            json.dump({"meta": {"exam": "ESENeph", "owner": "", "totalMcqs": 0, "sources": []}, "topics": []}, f)


def read_deck():
    with open(CFG.data, encoding="utf-8") as f:
        return json.load(f)


def write_deck(deck):
    """Atomic write with a one-level backup, so a crash never truncates the deck."""
    d = os.path.dirname(CFG.data) or "."
    if os.path.exists(CFG.data):
        shutil.copyfile(CFG.data, CFG.data + ".bak")
    fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(deck, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, CFG.data)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


class Handler(BaseHTTPRequestHandler):
    server_version = "Nephron/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, code, body, ctype="application/json; charset=utf-8", headers=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        if code >= 400:  # close on errors so an unread body can't desync keep-alive
            self.close_connection = True
            self.send_header("Connection", "close")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length", "0") or 0)
        if n > MAX_BODY:
            raise TooLarge()
        return self.rfile.read(n).decode("utf-8") if n else ""

    def _authed(self):
        raw = self.headers.get("Cookie")
        if not raw:
            return False
        jar = SimpleCookie()
        try:
            jar.load(raw)
        except Exception:
            return False
        m = jar.get(SESSION_NAME)
        return bool(m and valid_session(m.value))

    def _session_cookie(self, value, ttl):
        """Build a Set-Cookie header. Secure flag when the edge terminated TLS
        (Cloudflare sets X-Forwarded-Proto: https); omitted on plain-http dev."""
        parts = ["%s=%s" % (SESSION_NAME, value), "HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=%d" % ttl]
        if self.headers.get("X-Forwarded-Proto", "").lower() == "https":
            parts.append("Secure")
        return "; ".join(parts)

    def do_GET(self):
        self.route("GET")

    def do_HEAD(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def route(self, method):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        try:
            # ---- open endpoints (no session needed) ----
            if path == "/api/health":
                authed = self._authed()
                return self._send(200, {"ok": True, "backend": True, "authRequired": True,
                                        "authed": authed,
                                        "topics": len(read_deck().get("topics", [])) if authed else None})
            if path == "/api/login" and method == "POST":
                try:
                    body = json.loads(self._body() or "{}")
                except json.JSONDecodeError:
                    return self._send(400, {"ok": False, "errors": ["Malformed login request."]})
                u_ok = hmac.compare_digest(str(body.get("user", "")), AUTH_USER)
                p_ok = hmac.compare_digest(str(body.get("password", "")), AUTH_PASSWORD)
                if not (u_ok and p_ok):
                    time.sleep(0.4)  # gentle brute-force throttle
                    return self._send(401, {"ok": False, "errors": ["Incorrect username or password."]})
                ttl = SESSION_TTL_LONG if body.get("remember", True) else SESSION_TTL_SHORT
                return self._send(200, {"ok": True}, headers={"Set-Cookie": self._session_cookie(make_session(ttl), ttl)})
            if path == "/api/logout" and method == "POST":
                return self._send(200, {"ok": True}, headers={"Set-Cookie": self._session_cookie("", 0)})

            # ---- everything below requires a valid session ----
            if path in ("/api/deck", "/api/validate", "/api/ingest"):
                if not self._authed():
                    return self._send(401, {"ok": False, "errors": ["Not signed in."]})
            if path == "/api/deck" and method == "GET":
                return self._send(200, read_deck())
            if path == "/api/validate" and method == "POST":
                res = ME.validate_payload(self._body())
                summary = None
                if res["ok"]:
                    with LOCK:
                        _, summary = ME.merge_decks(read_deck(), res["data"])
                return self._send(200, {"ok": res["ok"], "errors": res["errors"],
                                        "warnings": res["warnings"], "summary": summary})
            if path == "/api/ingest" and method == "POST":
                mode = (urllib.parse.parse_qs(parsed.query).get("mode", ["merge"])[0])
                if mode not in ("merge", "replace"):
                    mode = "merge"
                res = ME.validate_payload(self._body())
                if not res["ok"]:
                    return self._send(400, {"ok": False, "errors": res["errors"], "warnings": res["warnings"]})
                with LOCK:
                    base = {"meta": res["data"].get("meta", {}), "topics": []} if mode == "replace" else read_deck()
                    deck, summary = ME.merge_decks(base, res["data"])
                    write_deck(deck)
                return self._send(200, {"ok": True, "mode": mode, "summary": summary,
                                        "warnings": res["warnings"], "deck": deck})
            if method == "GET":
                return self.static(path)
            return self._send(404, {"ok": False, "errors": ["Not found."]})
        except TooLarge:
            return self._send(413, {"ok": False, "errors": ["Payload too large."]})
        except BrokenPipeError:
            pass
        except Exception as e:  # noqa: BLE001 — return a clean 500 rather than crash the worker
            return self._send(500, {"ok": False, "errors": ["Server error: " + str(e)]})

    def static(self, path):
        if path in ("/", "", "/index.html"):
            path = "/nephrology-study.html"
        if path == "/data.json":  # legacy fallback: serve the live deck (gated like /api/deck)
            if not self._authed():
                return self._send(401, {"ok": False, "errors": ["Not signed in."]})
            return self._send(200, read_deck())
        full = os.path.normpath(os.path.join(APP_DIR, path.lstrip("/")))
        if not (full == APP_DIR or full.startswith(APP_DIR + os.sep)) or not os.path.isfile(full):
            return self._send(404, {"ok": False, "errors": ["Not found."]})
        ext = os.path.splitext(full)[1].lower()
        with open(full, "rb") as f:
            data = f.read()
        return self._send(200, data, MIME.get(ext, "application/octet-stream"))


def main():
    global CFG, AUTH_USER, AUTH_PASSWORD, AUTH_SRC, SESSION_SECRET
    CFG = config()
    seed_if_missing()
    AUTH_USER, AUTH_PASSWORD, AUTH_SRC = resolve_auth()
    SESSION_SECRET, _ = _secret_beside_deck(".session_secret", 32)
    httpd = ThreadingHTTPServer((CFG.host, CFG.port), Handler)
    sys.stderr.write("Nephron on http://%s:%d  data=%s\n" % (CFG.host, CFG.port, CFG.data))
    line = "=" * 68
    if AUTH_SRC in ("generated", "ephemeral"):
        sys.stderr.write("%s\nLOGIN  username: %s   password (%s): %s\n" % (line, AUTH_USER, AUTH_SRC, AUTH_PASSWORD))
        sys.stderr.write("Sign in with these at the site. ")
        if AUTH_SRC == "generated":
            sys.stderr.write("Password stored in .auth_password beside the deck.\n")
        else:
            sys.stderr.write("Could not persist it; set AUTH_PASSWORD to pin one.\n")
        sys.stderr.write(line + "\n")
    else:
        sys.stderr.write("Login: username '%s', password provided via AUTH_PASSWORD.\n" % AUTH_USER)
    sys.stderr.flush()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()


if __name__ == "__main__":
    main()
