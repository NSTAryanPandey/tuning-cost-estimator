"""Accounts: password hashing, login tokens and a simple login rate limit. Python standard library only.

Passwords
  Never stored as typed. We store PBKDF2-HMAC-SHA256 with a random 16-byte salt and 310,000 iterations
  (OWASP's recommendation for this algorithm), as "pbkdf2_sha256$iterations$salt$hash".
  Checking uses hmac.compare_digest so timing doesn't leak how many characters matched.

Tokens
  After login the user gets a signed token (same idea as a JWT, HS256): base64(payload).base64(signature).
  The payload holds the user id and an expiry time. The signature is HMAC-SHA256 with AUTH_SECRET,
  so nobody can change the user id without the server noticing. Tokens expire after 7 days.

Rate limit
  At most 10 failed logins per email per 15 minutes, to slow down password guessing.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from collections import defaultdict, deque

ITERATIONS = 310_000
TOKEN_TTL = 7 * 24 * 3600
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
DEV_SECRET = "dev-only-secret-change-me"


def secret() -> bytes:
    """AUTH_SECRET must be set to a long random string in production (Render environment variable)."""
    return os.getenv("AUTH_SECRET", DEV_SECRET).encode()


# ---------- passwords

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations))
        return hmac.compare_digest(digest.hex(), hash_hex)
    except (ValueError, TypeError):
        return False


def validate_new_account(email: str, password: str) -> str | None:
    """Returns an error message, or None if the email and password are acceptable."""
    if not EMAIL_RE.match(email or "") or len(email) > 254:
        return "Enter a valid email address."
    if len(password or "") < 8:
        return "Password must be at least 8 characters."
    if len(password) > 200:
        return "Password is too long."
    return None


# ---------- tokens

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def create_token(user_id: str, now: float | None = None) -> str:
    payload = {"sub": user_id, "exp": int((now or time.time()) + TOKEN_TTL)}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_token(token: str, now: float | None = None) -> str | None:
    """Returns the user id if the token is genuine and not expired, else None."""
    try:
        body, sig = token.split(".")
        expected = _b64(hmac.new(secret(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_unb64(body))
        if payload["exp"] < (now or time.time()):
            return None
        return str(payload["sub"])
    except (ValueError, KeyError, TypeError):
        return None


# ---------- rate limit

class LoginLimiter:
    def __init__(self, max_failures: int = 10, window: int = 15 * 60):
        self.max, self.window = max_failures, window
        self._fails: dict[str, deque] = defaultdict(deque)

    def _trim(self, key: str, now: float) -> deque:
        q = self._fails[key]
        while q and q[0] < now - self.window:
            q.popleft()
        return q

    def blocked(self, key: str, now: float | None = None) -> bool:
        return len(self._trim(key, now or time.time())) >= self.max

    def failed(self, key: str, now: float | None = None) -> None:
        self._trim(key, now or time.time()).append(now or time.time())

    def succeeded(self, key: str) -> None:
        self._fails.pop(key, None)
