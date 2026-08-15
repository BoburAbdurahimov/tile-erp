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
