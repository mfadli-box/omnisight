"""Unit test HMAC agent signer — vektor resmi RFC 4231 (selalu berjalan, no I/O)."""

from __future__ import annotations

import hashlib
import hmac as hmac_stdlib

import pytest

from application.hmac_agent import (
    RFC4231_CASE_1,
    RFC4231_CASE_1_EXPECTED,
    RFC4231_CASE_2,
    RFC4231_CASE_2_EXPECTED,
    agent_signature,
    body_sha256_hex,
    canonical_string,
    hmac_sha256_hex,
)

pytestmark = pytest.mark.unit

SECRET = "ab" * 32  # hex-64 contoh (256-bit)


def _reference_hmac(key: bytes, message: bytes) -> str:
    """HMAC-SHA256 RFC 2104 dihitung manual (tanpa modul hmac) — referensi bebas."""
    block = 64
    if len(key) > block:
        key = hashlib.sha256(key).digest()
    key = key + b"\x00" * (block - len(key))
    inner = hashlib.sha256(bytes(b ^ 0x36 for b in key) + message).digest()
    return hashlib.sha256(bytes(b ^ 0x5C for b in key) + inner).hexdigest()


def test_rfc4231_case_1():
    key, message = RFC4231_CASE_1
    assert hmac_sha256_hex(key, message) == RFC4231_CASE_1_EXPECTED


def test_rfc4231_case_2():
    key, message = RFC4231_CASE_2
    assert hmac_sha256_hex(key, message) == RFC4231_CASE_2_EXPECTED


def test_matches_independent_reference_hmac():
    """Kunci > block-size (128 byte) + pesan acak vs implementasi referensi manual."""
    for key, message in (
        (b"\xaa" * 131, b"Test Using Larger Than Block-Size Key - Hash First"),
        (bytes(range(256)) * 4, b"omnisight qa w2 canonical"),
        (b"short-key", b"x" * 1000),
    ):
        assert hmac_sha256_hex(key, message) == _reference_hmac(key, message)
        assert hmac_sha256_hex(key, message) == hmac_stdlib.new(
            key, message, hashlib.sha256
        ).hexdigest()


def test_canonical_string_shape():
    body = b'{"a":1}'
    expected = (
        f"1700000000\nPOST\n/api/v1/agents/metrics/ingest\n{body_sha256_hex(body)}"
    ).encode()
    assert canonical_string(1700000000, "post", "/api/v1/agents/metrics/ingest", body) == expected


def test_agent_signature_binds_body():
    ts, path = 1700000000, "/api/v1/agents/inventory/ingest"
    sig_a = agent_signature(SECRET, ts, "POST", path, b'{"payload":{}}')
    sig_b = agent_signature(SECRET, ts, "POST", path, b'{"payload":{"x":1}}')
    assert sig_a != sig_b, "signature tidak mengikat body — tampering tak terdeteksi"


def test_agent_signature_deterministic_and_method_sensitive():
    ts, path = 1700000000, "/api/v1/agents/logs"
    body = b'{"lines":[]}'
    assert agent_signature(SECRET, ts, "POST", path, body) == agent_signature(
        SECRET, ts, "POST", path, body
    )
    assert agent_signature(SECRET, ts, "POST", path, body) != agent_signature(
        SECRET, ts, "GET", path, body
    ), "signature tidak membedakan method"
