"""SOC-W3 Replay ephemeral PAM session ticket — Broken Auth (API2:2023, CWE-294/613).

Kontrak api-w3 §2 (`POST /agents/pam/ticket/redeem`, agent HMAC
`pam_bastion_gateway`): ticket 256-bit, TTL ≤ 120 s (clamp 30–600), SEKALI
pakai — redeem atomik `UPDATE … WHERE status='AUTHORIZED'` → pemakaian kedua
`409 CONFLICT`; hash tidak cocok/kedaluwarsa `401`; kredensial target hanya
turun SEKALI pada redeem yang sah (jalur internal) dan TIDAK PERNAH muncul
pada respons error/replay.
"""

from __future__ import annotations

import pytest

from application.w3_vectors import (
    malformed_tickets,
    random_ticket,
    secret_leak_scan,
    tampered_tickets,
)
from infrastructure.w2_soc_client import data_of, error_code
from infrastructure.w3_soc_client import TICKET_REDEEM, W3SecurityClient

pytestmark = [
    pytest.mark.soc,
    pytest.mark.auth_bypass,
    pytest.mark.pam,
    pytest.mark.wave3,
]


def _redeem(soc_w3: W3SecurityClient, session_id: str, ticket: str, gateway_credential):
    agent_id, secret = gateway_credential
    return soc_w3.post_agent(
        TICKET_REDEEM,
        {"session_id": session_id, "ticket": ticket},
        agent_id=agent_id,
        secret=secret,
    )


@pytest.fixture(scope="module")
def redeemed(soc_w3, pam_fresh_token, pam_account_id, gateway_credential):
    """Sekali per modul: authorize (ticket sah) → redeem pertama BERHASIL."""
    authorized = soc_w3.authorize_session(
        {"account_id": pam_account_id, "reason": "SOC-W3 uji replay ticket", "duration_minutes": 30},
        token=pam_fresh_token,
    )
    assert authorized.status_code == 201, (
        f"authorize awal gagal (HTTP {authorized.status_code}) — env akun/policy QA?"
    )
    data = data_of(authorized)
    session_id = str(data["session_id"])
    ticket = str(data["ticket"])
    first = _redeem(soc_w3, session_id, ticket, gateway_credential)
    assert first.status_code == 200, (
        f"redeem pertama gagal (HTTP {first.status_code}) — kredensial gateway "
        f"QA / status sesi? {first.body_excerpt[:160]!r}"
    )
    return {"session_id": session_id, "ticket": ticket, "first": first}


def test_redeem_success_returns_secret_once(redeemed, vault_canaries):
    """SOC-W3-020 — redeem sah: secret plaintext muncul TEPAT SEKALI (jalur internal)."""
    body = redeemed["first"].body_excerpt
    assert '"secret"' in body, "redeem sah tidak membawa kredensial target — gateway mati fungsi"
    canary_hits = [c for c in vault_canaries if c and body.count(c) > 1]
    assert not canary_hits, f"secret canary muncul >1× dalam satu respons: {canary_hits}"
    assert '"secret_encrypted"' not in body and "OMS1|" not in body, (
        "redeem mengembalikan blob ciphertext, bukan plaintext sekali-pakai"
    )


def test_replayed_ticket_rejected_with_conflict(soc_w3, redeemed, gateway_credential, vault_canaries):
    """SOC-W3-021 — INTI: ticket terpakai di-replay → 409 CONFLICT (sekali pakai atomik)."""
    replay = _redeem(soc_w3, redeemed["session_id"], redeemed["ticket"], gateway_credential)
    assert replay.status_code == 409, (
        f"REPLAY ticket diterima (HTTP {replay.status_code}) — kredensial target "
        "bisa ditarik ulang tanpa otorisasi: kritis (CWE-294)"
    )
    assert error_code(replay) == "CONFLICT"
    assert not secret_leak_scan(replay.body_excerpt, vault_canaries), (
        "respons replay membocorkan kredensial target"
    )


@pytest.mark.parametrize(
    "label,variant", tampered_tickets("0" * 64), ids=lambda l: l
)
def test_tampered_ticket_rejected(soc_w3, redeemed, gateway_credential, label, variant):
    """SOC-W3-022 — ticket sah dimanipulasi 1 karakter (bit-flip/truncate/append) → 401."""
    evidence = _redeem(soc_w3, redeemed["session_id"], variant, gateway_credential)
    assert evidence.status_code in (400, 401), (
        f"ticket tampered {label!r} diterima (HTTP {evidence.status_code}) — "
        "SHA-256 lookup tidak ketat"
    )
    assert error_code(evidence) == "UNAUTHORIZED"


def test_forged_random_ticket_rejected(soc_w3, redeemed, gateway_credential):
    """SOC-W3-023 — ticket acak 256-bit tidak pernah diterbitkan → 401 generik."""
    evidence = _redeem(soc_w3, redeemed["session_id"], random_ticket(), gateway_credential)
    assert evidence.status_code == 401, f"ticket palsu diterima (HTTP {evidence.status_code})"
    assert error_code(evidence) == "UNAUTHORIZED"


@pytest.mark.parametrize("bad_ticket", malformed_tickets(), ids=lambda t: t[:12] or "empty")
def test_malformed_ticket_rejected(soc_w3, redeemed, gateway_credential, bad_ticket):
    """SOC-W3-024 — ticket malformed (kosong/pendek/non-hex/unicode/traversal)."""
    evidence = _redeem(soc_w3, redeemed["session_id"], bad_ticket, gateway_credential)
    assert evidence.status_code in (400, 401, 404), (
        f"ticket malformed {bad_ticket[:16]!r} → HTTP {evidence.status_code}"
    )
    from application.w2_vectors import no_internal_leak

    assert no_internal_leak(evidence.body_excerpt)


def test_expired_ticket_rejected(soc_w3, gateway_credential):
    """SOC-W3-025 — ticket > TTL (env SOC_W3_EXPIRED_TICKET/SESSION_ID) → 401."""
    ticket = __import__("os").environ.get("SOC_W3_EXPIRED_TICKET", "")
    session_id = __import__("os").environ.get("SOC_W3_EXPIRED_SESSION_ID", "")
    if not (ticket and session_id):
        pytest.skip("SOC_W3_EXPIRED_TICKET/SOC_W3_EXPIRED_SESSION_ID tidak diset")
    evidence = _redeem(soc_w3, session_id, ticket, gateway_credential)
    assert evidence.status_code == 401, (
        f"ticket kedaluwarsa diterima (HTTP {evidence.status_code}) — TTL tidak ditegakkan"
    )
    assert error_code(evidence) == "UNAUTHORIZED"


@pytest.mark.parametrize(
    "case",
    ["missing_all", "wrong_secret", "bogus_agent_id", "stale_ts"],
)
def test_gateway_impersonation_rejected(soc_w3, redeemed, case):
    """SOC-W3-026 — redeem tanpa HMAC / secret salah / agent palsu / ts stale → 401 generik."""
    import os
    import time
    import uuid as _uuid

    payload = {"session_id": redeemed["session_id"], "ticket": redeemed["ticket"]}
    if case == "missing_all":
        evidence = soc_w3.post_json(TICKET_REDEEM, payload)
    elif case == "wrong_secret":
        evidence = soc_w3.post_agent(
            TICKET_REDEEM, payload,
            agent_id=os.environ["SOC_W3_GATEWAY_AGENT_ID"], secret="00" * 32,
        )
    elif case == "bogus_agent_id":
        evidence = soc_w3.post_agent(
            TICKET_REDEEM, payload,
            agent_id=str(_uuid.uuid4()), secret=random_ticket(),
        )
    else:  # stale_ts
        from application.w2_vectors import wrong_secret_is_valid_hex

        secret_hex = os.environ["SOC_W3_GATEWAY_HMAC_SECRET"]
        assert wrong_secret_is_valid_hex(secret_hex)
        evidence = soc_w3.post_agent(
            TICKET_REDEEM, payload,
            agent_id=os.environ["SOC_W3_GATEWAY_AGENT_ID"], secret=secret_hex,
            ts=int(time.time()) - 3600,
        )
    assert evidence.status_code == 401, (
        f"impersonasi gateway ({case}) diterima (HTTP {evidence.status_code}) — "
        "redeem harus verifikasi HMAC agent gateway"
    )
    assert error_code(evidence) == "UNAUTHORIZED"
    assert '"secret"' not in evidence.body_excerpt, (
        "respons penolakan impersonasi membocorkan kredensial target"
    )
