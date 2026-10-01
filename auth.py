import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

MAX_INIT_AGE = 24 * 3600  # initData живёт сутки


def _hmac(key: bytes, msg: bytes) -> bytes:
    return hmac.new(key, msg, hashlib.sha256).digest()


def verify_init_data(init_data: str, bot_token: str) -> dict | None:
    """Telegram WebApp initData → user dict или None если подпись/срок не ок."""
    if not init_data or not bot_token:
        return None
    try:
        parsed = dict(parse_qsl(init_data, keep_blank_values=True))
    except Exception:
        return None

    recv_hash = parsed.pop("hash", "")
    if not recv_hash:
        return None

    data_check = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
    secret = _hmac(b"WebAppData", bot_token.encode())
    calc = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc, recv_hash):
        return None

    try:
        auth_date = int(parsed.get("auth_date", "0"))
    except ValueError:
        return None
    if time.time() - auth_date > MAX_INIT_AGE:
        return None

    try:
        user = json.loads(parsed.get("user", "{}"))
    except Exception:
        return None
    if not user.get("id"):
        return None
    return user


def verify_cryptopay_sig(raw_body: bytes, signature: str, token: str) -> bool:
    """SHA256(token) → HMAC-SHA256(raw_body) — сверяем с заголовком."""
    if not signature or not token:
        return False
    secret = hashlib.sha256(token.encode()).digest()
    calc = hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(calc, signature)
