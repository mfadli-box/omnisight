"""SOC-W2 HMAC agent forgery/replay — Broken Authentication (API2:2023, CWE-344/347)."""

from __future__ import annotations

import time

import pytest

from application.w2_vectors import no_internal_leak
from infrastructure.w2_soc_client import error_code, sign_agent_request

pytestmark = [
    pytest.mark.soc,
    pytest.mark.auth_bypass,
    pytest.mark.wave2,
]

INGEST = "/api/v1/agents/inventory/ingest"
LOGS = "/api/v1/agents/logs"
BODY = {"payload": {"soc_probe": True}}


def test_valid_signature_positive_control(soc_w2, agent_credential):
    """SOC-W2-010 — kontrol positif: signature sah → 202 (bukan 401).

    Menjamin vektor forgery berikut ditolak KARENA kripto, bukan karena
    endpoint mati atau kredensial env salah.
    """
    agent_id, secret = agent_credential
    evidence = soc_w2.post_agent(INGEST, BODY, agent_id=agent_id, secret=secret)
    assert evidence.status_code == 202, (
        f"kontrol positif gagal: HTTP {evidence.status_code} {evidence.body_excerpt[:160]!r}"
    )


@pytest.mark.parametrize("drift", ["stale_1h", "future_1h", "stale_31s"])
def test_timestamp_outside_replay_window(soc_w2, agent_credential, drift):
    """SOC-W2-011 — timestamp di luar window ±30 s → 401 (anti-replay)."""
    agent_id, secret = agent_credential
    now = int(time.time())
    ts = {"stale_1h": now - 3600, "future_1h": now + 3600, "stale_31s": now - 31}[drift]
    evidence = soc_w2.post_agent(INGEST, BODY, agent_id=agent_id, secret=secret, ts=ts)
    assert evidence.status_code == 401, (
        f"timestamp {drift} diterima (HTTP {evidence.status_code}) — window "
        "anti-replay ±30 s tidak ditegakkan"
    )
    assert error_code(evidence) == "UNAUTHORIZED"


def test_tampered_body_rejected(soc_w2, agent_credential):
    """SOC-W2-012 — body dikirim ≠ body yang di-sign → 401 (signature binds body)."""
    agent_id, secret = agent_credential
    evidence = soc_w2.post_agent(
        INGEST, BODY, agent_id=agent_id, secret=secret,
        body_override=b'{"payload":{"soc_probe":true,"tampered":true}}',
    )
    assert evidence.status_code == 401, (
        f"body tampered diterima (HTTP {evidence.status_code}) — hash body tidak "
        "diikat ke signature"
    )


def test_wrong_secret_signature_rejected(soc_w2, agent_credential):
    """SOC-W2-013 — signature dihitung dengan secret salah → 401."""
    agent_id, secret = agent_credential
    evidence = soc_w2.post_agent(
        INGEST, BODY, agent_id=agent_id, secret=secret,
        signature=sign_agent_request("00" * 32, int(time.time()), "POST", INGEST, b'{"payload": {"soc_probe": true}}'),
    )
    assert evidence.status_code == 401, (
        f"signature secret-salah diterima (HTTP {evidence.status_code}) — "
        "verifikasi HMAC lemah"
    )


def test_cross_endpoint_signature_reuse(soc_w2, agent_credential):
    """SOC-W2-014 — signature /inventory dipakai ulang di /agents/logs → 401."""
    agent_id, secret = agent_credential
    evidence = soc_w2.post_agent(
        LOGS,
        {
            "scope": "docker_stack",
            "reference": "00000000-0000-0000-0000-000000000000",
            "source": "compose",
            "level": "INFO",
            "lines": ["soc replay probe"],
        },
        agent_id=agent_id,
        secret=secret,
        signature=sign_agent_request(
            secret, int(time.time()), "POST", INGEST, b'{"payload": {"soc_probe": true}}'
        ),
    )
    assert evidence.status_code == 401, (
        f"signature lintas-endpoint diterima (HTTP {evidence.status_code}) — "
        "path tidak diikat ke kanonis signature"
    )


@pytest.mark.parametrize(
    "omit", [frozenset({"X-Agent-Signature"}), frozenset({"X-Agent-Timestamp"}), frozenset({"X-Agent-Id"})]
)
def test_missing_agent_headers_rejected(soc_w2, agent_credential, omit):
    """SOC-W2-015 — header agent hilang satu saja → 401."""
    agent_id, secret = agent_credential
    evidence = soc_w2.post_agent(INGEST, BODY, agent_id=agent_id, secret=secret, omit=omit)
    assert evidence.status_code == 401, (
        f"tanpa {sorted(omit)} diterima (HTTP {evidence.status_code})"
    )


def test_garbage_signature_rejected(soc_w2, agent_credential):
    """SOC-W2-016 — signature bukan hex/terpotong → 401, tanpa 5xx/leak."""
    agent_id, secret = agent_credential
    for garbage in ("zz" * 32, "ff", "a" * 64 + "b", "$(whoami)"):
        evidence = soc_w2.post_agent(
            INGEST, BODY, agent_id=agent_id, secret=secret, signature=garbage
        )
        assert evidence.status_code in (400, 401), (
            f"signature {garbage[:16]!r} → HTTP {evidence.status_code} (harus 4xx)"
        )
        assert no_internal_leak(evidence.body_excerpt)


def test_forged_agent_id_rejected(soc_w2, agent_credential):
    """SOC-W2-017 — X-Agent-Id agent asing + signature self → 401 (generik)."""
    agent_id, secret = agent_credential
    evidence = soc_w2.post_agent(
        INGEST, BODY, agent_id="00000000-0000-0000-0000-000000000000", secret=secret
    )
    assert evidence.status_code == 401, (
        f"agent id palsu diterima (HTTP {evidence.status_code}) — secret tidak "
        "diambil per-agent dari vault"
    )
    bad_sig = soc_w2.post_agent(
        INGEST, BODY, agent_id=agent_id,
        signature=sign_agent_request("11" * 32, int(time.time()), "POST", INGEST, b"{}"),
    )
    assert error_code(evidence) == error_code(bad_sig) == "UNAUTHORIZED", (
        "pesan 'agent tidak ada' vs 'signature salah' terdiferensiasi — "
        "enumerasi agent (api-w2 §4: harus generik)"
    )
    assert no_internal_leak(evidence.body_excerpt)
