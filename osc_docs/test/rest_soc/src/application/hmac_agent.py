"""HMAC-SHA256 agent signer (api-w2 §2.1) — pure stdlib, zero I/O.

Kanonis signature: ``HMAC-SHA256(secret, "{ts}\\n{METHOD}\\n{path}\\n{sha256_hex(body)}")``
- ts = unix epoch detik, window anti-replay ±30 s (server-side).
- Diverifikasi vektor resmi RFC 4231 (test case 1, 2, 6) di test/unit.
"""

from __future__ import annotations

import hashlib
import hmac

RFC4231_CASE_1 = (b"\x0b" * 20, b"Hi There")
RFC4231_CASE_1_EXPECTED = (
    "b0344c61d8db38535ca8afceaf0bf12b"
    "881dc200c9833da726e9376c2e32cff7"
)
RFC4231_CASE_2 = (b"Jefe", b"what do ya want for nothing?")
RFC4231_CASE_2_EXPECTED = (
    "5bdcc146bf60754e6a042426089575c7"
    "5a003f089d2739839dec58b964ec3843"
)


def hmac_sha256_hex(key: bytes, message: bytes) -> str:
    """HMAC-SHA256 (RFC 2104) → hex lowercase."""
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def body_sha256_hex(body: bytes) -> str:
    """Hash kanonis body (mengikat signature ke isi request)."""
    return hashlib.sha256(body).hexdigest()


def canonical_string(ts: int, method: str, path: str, body: bytes) -> bytes:
    """String kanonis persis seperti spesifikasi (LF pemisah, metode upper)."""
    return (
        f"{ts}\n{method.upper()}\n{path}\n{body_sha256_hex(body)}"
    ).encode("utf-8")


def agent_signature(secret_hex: str, ts: int, method: str, path: str, body: bytes) -> str:
    """Signature header `X-Agent-Signature` untuk satu request agent."""
    key = bytes.fromhex(secret_hex)
    return hmac_sha256_hex(key, canonical_string(ts, method, path, body))
