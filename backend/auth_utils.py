import hashlib
import hmac
import secrets

def hash_password(password: str) -> str:
    """Hash a password with SHA256 and a random salt."""
    salt = secrets.token_hex(16)
    pw_hash = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return f"{salt}${pw_hash}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against the stored salt$hash."""
    if not hashed_password:
        return False
    if "$" not in hashed_password:
        # Fallback for plain text password comparison if any
        return plain_password == hashed_password
    salt, pw_hash = hashed_password.split("$", 1)
    test_hash = hashlib.sha256((salt + plain_password).encode("utf-8")).hexdigest()
    return hmac.compare_digest(pw_hash, test_hash)


# ---------------------------------------------------------------- tokens
#
# A login token is "<payload>.<signature>": the payload is base64url JSON
# {"uid", "u", "exp"} and the signature an HMAC-SHA256 of it with the server
# secret, so it cannot be forged or edited without that secret.

import base64
import json
import os
import time

TOKEN_TTL_SECONDS = 30 * 24 * 3600   # stay logged in for 30 days
OTP_TTL_SECONDS = 5 * 60             # a Telegram code is valid for 5 minutes
OTP_MAX_ATTEMPTS = 5


def _secret() -> bytes:
    # Set ERP_SECRET_KEY in the environment. Without it the secret is derived
    # from DATABASE_URL, which is private and the same on every server
    # instance, so tokens stay valid across serverless restarts.
    key = os.getenv("ERP_SECRET_KEY")
    if not key:
        from backend.config import DATABASE_URL
        key = "tile-erp-token:" + DATABASE_URL
    return hashlib.sha256(key.encode("utf-8")).digest()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(payload: str) -> str:
    return _b64(hmac.new(_secret(), payload.encode("ascii"), hashlib.sha256).digest())


def create_token(user_id: int, username: str) -> str:
    payload = _b64(json.dumps(
        {"uid": user_id, "u": username, "exp": int(time.time()) + TOKEN_TTL_SECONDS},
        separators=(",", ":"),
    ).encode("utf-8"))
    return f"{payload}.{_sign(payload)}"


def decode_token(token: str):
    """The token's payload dict, or None if it is forged, edited or expired."""
    try:
        payload, sig = (token or "").split(".", 1)
        if not hmac.compare_digest(sig, _sign(payload)):
            return None
        data = json.loads(_unb64(payload))
        if int(data.get("exp", 0)) < time.time():
            return None
        return data
    except Exception:
        return None


# ---------------------------------------------------------------- one-time codes

def new_otp_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(challenge_id: int, code: str) -> str:
    # Bound to the challenge, so a code is useless for any other login.
    return hmac.new(_secret(), f"otp:{challenge_id}:{code}".encode("utf-8"), hashlib.sha256).hexdigest()


def phone_key(phone) -> str:
    """Last 9 digits of a phone number: +998 90 123-45-67 and 901234567 match."""
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    return digits[-9:] if len(digits) >= 9 else ""
