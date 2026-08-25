"""Password hashing for admin-created sub-users.

Uses PBKDF2-HMAC-SHA256 from the stdlib rather than pulling in bcrypt/passlib
-- it's the same primitive Django ships by default and needs no dependency.
Stored format: pbkdf2_sha256$<iterations>$<b64 salt>$<b64 hash>
"""

import base64
import hashlib
import hmac
import os

from cryptography.fernet import Fernet, InvalidToken

from ..config import settings

ALGORITHM = "pbkdf2_sha256"
ITERATIONS = 600_000  # OWASP guidance for PBKDF2-HMAC-SHA256
SALT_BYTES = 16


def hash_password(password: str) -> str:
    salt = os.urandom(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"{ALGORITHM}${ITERATIONS}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        algorithm, iterations, salt_b64, digest_b64 = stored.split("$")
        if algorithm != ALGORITHM:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), base64.b64decode(salt_b64), int(iterations)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, base64.b64decode(digest_b64))


# --------------------------------------------------------------------------
# Reversible copy, so an admin can reveal a sub-user's password later.
#
# This is a deliberate weakening of the usual "never store recoverable
# passwords" rule, requested so admins don't have to reset a password just
# to remind themselves what they set it to. Never used for login -- that
# always goes through hash_password/verify_password above. Key is derived
# from the app's existing secret_key so no separate secret needs managing;
# rotating secret_key therefore also makes existing encrypted passwords
# unreadable, same as it already invalidates every issued JWT.
# --------------------------------------------------------------------------
def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.secret_key.encode()).digest())
    return Fernet(key)


def encrypt_password(password: str) -> str:
    return _fernet().encrypt(password.encode()).decode()


def decrypt_password(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError, TypeError):
        return None
