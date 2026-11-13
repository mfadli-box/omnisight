"""TOTP (RFC 6238) murni untuk test MFA osc_rest — tanpa dependensi eksternal.

Kontrak (api-w1 §auth/mfa/*): secret base32 160-bit, step 30 s, 6 digit,
SHA1, toleransi ±1 step. Dipakai untuk:
- generate kode `enable`/`verify` pada step saat ini,
- kode step+1 / step-1 (uji toleransi),
- replikasi kode yang sama (anti-replay, dipakai pula oleh suite SOC
  melalui salinan lokal — workspace terpisah).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import struct
import time

STEP_SECONDS = 30
DIGITS = 6


def base32_decode(secret: str) -> bytes:
    """Dekode secret base32 (toleran terhadap spasi/uppercase tanpa padding)."""
    normalized = secret.strip().replace(" ", "").upper()
    padding = "=" * (-len(normalized) % 8)
    return base64.b32decode(normalized + padding)


def hotp(key: bytes, counter: int, digits: int = DIGITS) -> str:
    """RFC 4226 HMAC-SHA1 truncated, tanpa state."""
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % (
        10**digits
    )
    return str(code).zfill(digits)


def totp_code(secret: str, at_unix: float | None = None, step_offset: int = 0) -> str:
    """Kode TOTP pada step `(at_unix // 30) + step_offset` (offset untuk toleransi ±1)."""
    moment = time.time() if at_unix is None else at_unix
    step = int(moment // STEP_SECONDS) + step_offset
    return hotp(base32_decode(secret), step)


def secret_from_otpauth_uri(uri: str) -> str:
    """Ambil parameter `secret` dari URI `otpauth://totp/...?secret=...`."""
    marker = "secret="
    index = uri.find(marker)
    if index < 0:
        raise ValueError(f"parameter secret tidak ditemukan pada URI: {uri[:48]!r}")
    tail = uri[index + len(marker) :]
    return tail.split("&", 1)[0]
