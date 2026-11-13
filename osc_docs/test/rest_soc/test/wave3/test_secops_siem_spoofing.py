"""SOC-W3 Spoofing event SIEM/FIM tanpa HMAC valid — API2/API8 (CWE-294/345).

Kontrak api-w3 §2 (`POST /api/v1/agents/security/ingest`, agent HMAC):
- tanpa/salah HMAC, timestamp luar ±30 s, body tampering, agent palsu →
  `401 UNAUTHORIZED` generik — TIDAK ADA event yang ter-persist (poisoning
  antrean SOC/FIM/CVE harus mustahil);
- HMAC sah pun: `asset_id` dipaksa identik agent pelapor (anti-spoof lintas
  host) dan field invalid ditolak 400 SEBELUM persist;
- kontrol: `GET /secops/overview` counts tidak berubah setelah serangan.
"""

from __future__ import annotations

import json
import time

import pytest

from application.w2_vectors import no_internal_leak
from application.w3_vectors import (
    batch_over_limit_payloads,
    forged_alert_batch,
    forged_fim_batch,
    forged_spoof_batches,
    hmac_forgery_cases,
    invalid_event_fields,
    random_ticket,
)
from infrastructure.w2_soc_client import error_code, json_body, sign_agent_request
from infrastructure.w3_soc_client import SECOPS_OVERVIEW

pytestmark = [
    pytest.mark.soc,
    pytest.mark.auth_bypass,
    pytest.mark.siem,
    pytest.mark.wave3,
]

INGEST = "/api/v1/agents/security/ingest"


def _counts(soc_w3, token: str) -> dict | None:
    """Snapshot counts SOC (None bila overview tidak tersedia — verifikasi longgar)."""
    evidence = soc_w3.get_json(SECOPS_OVERVIEW, token=token)
    if evidence.status_code != 200:
        return None
    body = json_body(evidence) or {}
    counts = (body.get("data") or {}).get("counts")
    return counts if isinstance(counts, dict) else None


def _assert_counts_unchanged(before, after):
    if before is None or after is None:
        pytest.skip("GET /secops/overview tidak tersedia — verifikasi counts dilewati")
    assert after == before, (
        f"counts SIEM berubah setelah serangan tanpa HMAC: {before} → {after} — "
        "event SPOOFED ter-persist (SIEM poisoning)"
    )


def test_forged_fim_without_hmac_rejected(soc_w3, pam_fresh_token):
    """SOC-W3-042 — batch FIM palsu (`/etc/shadow` MODIFIED) TANPA header HMAC → 401."""
    before = _counts(soc_w3, pam_fresh_token)
    evidence = soc_w3.post_json(INGEST, forged_fim_batch())
    assert evidence.status_code == 401, (
        f"ingest tanpa HMAC diterima (HTTP {evidence.status_code}) — SIEM bisa "
        "diracun tanpa kredensial: kritis"
    )
    assert error_code(evidence) == "UNAUTHORIZED"
    after = _counts(soc_w3, pam_fresh_token)
    _assert_counts_unchanged(before, after)


@pytest.mark.parametrize("label,payload", forged_spoof_batches(), ids=lambda l: l)
def test_all_spoof_classes_without_hmac_rejected(soc_w3, label, payload):
    """SOC-W3-043 — keempat kelas event (FIM/alert/CVE/compliance) tanpa HMAC → 401."""
    evidence = soc_w3.post_json(INGEST, payload)
    assert evidence.status_code == 401, (
        f"kelas {label!r} tanpa HMAC diterima (HTTP {evidence.status_code})"
    )
    assert error_code(evidence) == "UNAUTHORIZED"
    assert no_internal_leak(evidence.body_excerpt)


@pytest.mark.parametrize("case", hmac_forgery_cases())
def test_hmac_forgery_variants_rejected(
    soc_w3, ingest_agent_credential, case, pam_fresh_token
):
    """SOC-W3-044 — 9 varian pemalsuan HMAC (fault injection) → 401 generik + zero persist.

    Mencakup: header hilang, signature garbage/salah-secret, body tampering
    (partial replay), agent palsu, timestamp stale/future, reuse signature
    lintas-endpoint.
    """
    agent_id, secret = ingest_agent_credential
    payload = forged_fim_batch()
    before = _counts(soc_w3, pam_fresh_token)
    import uuid as _uuid

    if case == "missing_all_headers":
        evidence = soc_w3.post_json(INGEST, payload)
    elif case == "missing_signature_only":
        evidence = soc_w3.post_agent(
            INGEST, payload, agent_id=agent_id, secret=secret, omit=frozenset({"X-Agent-Signature"})
        )
    elif case == "garbage_signature":
        evidence = soc_w3.post_agent(
            INGEST, payload, agent_id=agent_id, secret=secret, signature="z" * 64
        )
    elif case == "wrong_secret":
        evidence = soc_w3.post_agent(
            INGEST, payload, agent_id=agent_id, secret="00" * 32
        )
    elif case == "tampered_body":
        body = json.dumps(payload).encode()
        evidence = soc_w3.post_agent(
            INGEST, payload, agent_id=agent_id, secret=secret, body_override=body + b" "
        )
    elif case == "bogus_agent_id":
        evidence = soc_w3.post_agent(
            INGEST, payload, agent_id=str(_uuid.uuid4()), secret=random_ticket()
        )
    elif case == "stale_timestamp":
        evidence = soc_w3.post_agent(
            INGEST, payload, agent_id=agent_id, secret=secret, ts=int(time.time()) - 3600
        )
    elif case == "future_timestamp":
        evidence = soc_w3.post_agent(
            INGEST, payload, agent_id=agent_id, secret=secret, ts=int(time.time()) + 3600
        )
    else:  # cross_endpoint_reuse — signature /inventory/ingest dipakai di security/ingest
        ts = int(time.time())
        body = json.dumps(payload).encode()
        sig = sign_agent_request(secret, ts, "POST", "/api/v1/agents/inventory/ingest", body)
        from infrastructure.w2_soc_client import AGENT_ID_HEADER, AGENT_SIG_HEADER, AGENT_TS_HEADER

        evidence = soc_w3._inner.send(
            "POST", INGEST,
            headers={
                "Content-Type": "application/json",
                "X-Correlation-ID": str(_uuid.uuid4()),
                AGENT_ID_HEADER: agent_id,
                AGENT_TS_HEADER: str(ts),
                AGENT_SIG_HEADER: sig,
            },
            content=body,
        )
    assert evidence.status_code == 401, (
        f"pemalsuan HMAC ({case}) diterima (HTTP {evidence.status_code})"
    )
    assert error_code(evidence) == "UNAUTHORIZED"
    _assert_counts_unchanged(before, _counts(soc_w3, pam_fresh_token))


def test_spoofed_critical_alert_never_persists(soc_w3, pam_fresh_token):
    """SOC-W3-045 — alert CRITICAL palsu (MITRE T1078) tanpa HMAC → 401 + counts tetap."""
    before = _counts(soc_w3, pam_fresh_token)
    evidence = soc_w3.post_json(INGEST, forged_alert_batch())
    assert evidence.status_code == 401
    after = _counts(soc_w3, pam_fresh_token)
    _assert_counts_unchanged(before, after)
    if after is not None:
        assert after.get("alerts_unacknowledged", 0) == before.get("alerts_unacknowledged", 0), (
            "alert palsu masuk antrean SOC — operator dibanjiri false positive"
        )


def test_valid_hmac_cross_host_asset_spoof_rejected(
    soc_w3, ingest_agent_credential, pam_fresh_token
):
    """SOC-W3-046 — HMAC sah tapi `asset_id` ≠ agent pelapor → 400 (anti-spoof lintas host)."""
    agent_id, secret = ingest_agent_credential
    before = _counts(soc_w3, pam_fresh_token)
    payload = forged_fim_batch()  # asset_id = zero UUID — bukan milik agent ini
    evidence = soc_w3.post_agent(INGEST, payload, agent_id=agent_id, secret=secret)
    assert evidence.status_code == 400, (
        f"spoofing asset_id lintas host diterima (HTTP {evidence.status_code}) — "
        "agent bisa melapor atas host lain (api-w3 §1 anti-spoof dilanggar)"
    )
    assert error_code(evidence) == "VALIDATION_ERROR"
    _assert_counts_unchanged(before, _counts(soc_w3, pam_fresh_token))


@pytest.mark.parametrize("label,payload", invalid_event_fields(), ids=lambda l: l)
def test_valid_hmac_invalid_fields_rejected_before_persist(
    soc_w3, ingest_agent_credential, label, payload, pam_fresh_token
):
    """SOC-W3-047 — field invalid (checksum/CVE/CVSS/enum) ber-HMAC sah → 400, zero persist."""
    agent_id, secret = ingest_agent_credential
    before = _counts(soc_w3, pam_fresh_token)
    evidence = soc_w3.post_agent(INGEST, payload, agent_id=agent_id, secret=secret)
    assert evidence.status_code == 400, (
        f"field invalid {label!r} diterima (HTTP {evidence.status_code}) — "
        "validasi harus sebelum persist"
    )
    assert error_code(evidence) == "VALIDATION_ERROR"
    _assert_counts_unchanged(before, _counts(soc_w3, pam_fresh_token))


@pytest.mark.parametrize("label,payload", batch_over_limit_payloads(), ids=lambda l: l)
def test_batch_over_limit_rejected(soc_w3, ingest_agent_credential, label, payload):
    """SOC-W3-048 — batch di atas batas (501/201) → 400 VALIDATION_ERROR."""
    agent_id, secret = ingest_agent_credential
    evidence = soc_w3.post_agent(INGEST, payload, agent_id=agent_id, secret=secret)
    assert evidence.status_code == 400, (
        f"batch over-limit {label!r} diterima (HTTP {evidence.status_code}) — "
        "batas batch api-w3 §2 tidak ditegakkan"
    )
    assert error_code(evidence) == "VALIDATION_ERROR"


def test_ingest_burst_forged_no_5xx(soc_w3):
    """SOC-W3-049 — burst 12 ingest tanpa HMAC → hanya 401/429; TIDAK ADA 5xx."""
    statuses: list[int] = []
    for _ in range(12):
        evidence = soc_w3.post_json(INGEST, forged_fim_batch())
        statuses.append(evidence.status_code)
    assert all(s in (401, 429) for s in statuses), (
        f"status tak terduga saat burst spoofing: {statuses}"
    )


def test_forged_response_shape_generic(soc_w3):
    """SOC-W3-050 — respons penolakan spoofing: envelope generik, tanpa detail internal."""
    evidence = soc_w3.post_json(INGEST, forged_fim_batch())
    body = (json_body(evidence) or {})
    assert body.get("status") == "error", "envelope error tidak konsisten"
    assert no_internal_leak(evidence.body_excerpt)
    assert "fim_events" not in body, "error meng-echo payload spoofed balik"
