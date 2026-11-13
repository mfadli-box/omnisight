"""SOC-W2 replay/expired enrollment token — Broken Authentication (API2:2023, CWE-294/613)."""

from __future__ import annotations

import pytest

from application.w2_vectors import (
    malformed_enrollment_tokens,
    no_internal_leak,
    random_enrollment_token,
)
from infrastructure.w2_soc_client import error_code

pytestmark = [
    pytest.mark.soc,
    pytest.mark.auth_bypass,
    pytest.mark.wave2,
]

ENROLL = "/api/v1/agents/enroll"


def _enroll_payload(token_value: str) -> dict[str, str]:
    # Model/label UUID nol: validasi FK pasti menolak — fokus kita STATUS
    # penolakan TOKEN (401 sebelum FK), bukan kepemilikan referensi.
    return {
        "enrollment_token": token_value,
        "hostname": "soc-w2-probe",
        "mgmt_ip": "10.10.254.200",
        "asset_model_id": "00000000-0000-0000-0000-000000000000",
        "status_label_id": "00000000-0000-0000-0000-000000000000",
    }


def _mint_token(soc_w2, soc_admin_token) -> str:
    from infrastructure.w2_soc_client import data_of

    issued = soc_w2.post_json(
        "/api/v1/agents/enrollment-tokens",
        {"node_type": "HOST"},
        token=soc_admin_token,
    )
    assert issued.status_code == 201, (
        f"issue token gagal: HTTP {issued.status_code} — env admin sah?"
    )
    token = str(data_of(issued).get("token", ""))
    assert token, "token tidak dikembalikan"
    return token


def test_replayed_enrollment_token_rejected(soc_w2, soc_admin_token):
    """SOC-W2-001 — token sah dipakai DUA kali → klaim kedua 401 (one-time atomik)."""
    token_value = _mint_token(soc_w2, soc_admin_token)
    first = soc_w2.post_json(ENROLL, _enroll_payload(token_value))
    assert first.status_code in (201, 400, 409), (
        f"enroll pertama harus diproses (HTTP {first.status_code}); FK QA boleh "
        "menolak, tapi token TIDAK BOLEH hangus tanpa pemakaian"
    )
    replay = soc_w2.post_json(ENROLL, _enroll_payload(token_value))
    assert replay.status_code == 401, (
        f"REPLAY token diterima (HTTP {replay.status_code}) — konsumsi token "
        "tidak one-time; CVE-style broken auth"
    )
    assert error_code(replay) == "UNAUTHORIZED"
    assert "agent_id" not in replay.body_excerpt and "hmac_secret" not in replay.body_excerpt, (
        "respons replay membocorkan kredensial agent"
    )
    assert no_internal_leak(replay.body_excerpt)


def test_double_claim_after_success_leaks_nothing(soc_w2, soc_admin_token):
    """SOC-W2-002 — respons replay tidak membedakan 'terpakai' vs 'tidak ada'."""
    token_value = _mint_token(soc_w2, soc_admin_token)
    soc_w2.post_json(ENROLL, _enroll_payload(token_value))
    replay = soc_w2.post_json(ENROLL, _enroll_payload(token_value))
    unknown = soc_w2.post_json(ENROLL, _enroll_payload(random_enrollment_token()))
    assert replay.status_code == unknown.status_code == 401, (
        "pesan/status replay vs token-palsu berbeda → memungkinkan enumerasi "
        "token (user-side channel)"
    )


def test_unknown_random_token_rejected(soc_w2):
    """SOC-W2-003 — token acak tak pernah diterbitkan → 401 generik, tanpa leak."""
    evidence = soc_w2.post_json(ENROLL, _enroll_payload(random_enrollment_token()))
    assert evidence.status_code == 401, f"HTTP {evidence.status_code}"
    assert error_code(evidence) == "UNAUTHORIZED"
    assert no_internal_leak(evidence.body_excerpt)


@pytest.mark.parametrize("bad_token", malformed_enrollment_tokens(), ids=lambda t: t[:12] or "empty")
def test_malformed_token_rejected(soc_w2, bad_token):
    """SOC-W2-004 — token malformed (kosong/pendek/non-hex/unicode/traversal)."""
    evidence = soc_w2.post_json(ENROLL, _enroll_payload(bad_token))
    assert evidence.status_code in (400, 401), (
        f"token malformed {bad_token[:16]!r} → HTTP {evidence.status_code} (harus 400/401)"
    )
    assert no_internal_leak(evidence.body_excerpt)


def test_expired_token_rejected(soc_w2):
    """SOC-W2-005 — token kedaluwarsa (env) → 401 UNAUTHORIZED."""
    expired = __import__("os").environ.get("SOC_W2_EXPIRED_ENROLLMENT_TOKEN", "")
    if not expired:
        pytest.skip("SOC_W2_EXPIRED_ENROLLMENT_TOKEN tidak diset — sediakan token > TTL")
    evidence = soc_w2.post_json(ENROLL, _enroll_payload(expired))
    assert evidence.status_code == 401, (
        f"token kedaluwarsa diterima (HTTP {evidence.status_code}) — TTL tidak ditegakkan"
    )
    assert error_code(evidence) == "UNAUTHORIZED"


def test_burst_brute_force_no_5xx(soc_w2):
    """SOC-W2-006 — burst 12 percobaan → 401/429 konsisten; TIDAK ADA 5xx."""
    statuses: list[int] = []
    for _ in range(12):
        evidence = soc_w2.post_json(ENROLL, _enroll_payload(random_enrollment_token()))
        statuses.append(evidence.status_code)
    assert all(s in (401, 429) for s in statuses), (
        f"status tak terduga saat brute-force: {statuses}"
    )
