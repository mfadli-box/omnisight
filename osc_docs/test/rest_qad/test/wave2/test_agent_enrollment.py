"""QA-W2-E* — Agent Enrollment (api-w2 §2.1): issue token, enroll, one-time atomik."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from application.w2_flows import (
    credential_of,
    enroll_agent,
    is_hex64,
    is_uuid,
    issue_enrollment_token,
    parsed_token,
)
from infrastructure.w2_client import error_code_of

pytestmark = [
    pytest.mark.integration,
    pytest.mark.contract,
    pytest.mark.wave2,
]


def test_issue_token_admin_mint_once(require_w2, admin_token):
    """QA-W2-E01 — admin menerbitkan token: hex-64, UUID id, expires_at wajar."""
    snapshot = issue_enrollment_token(require_w2, token=admin_token, node_type="HOST")
    assert snapshot.status_code == 201, f"HTTP {snapshot.status_code}: {snapshot.body_text[:200]!r}"
    token = parsed_token(snapshot)
    assert token.token and is_hex64(token.token), "token bukan hex-64"
    assert is_uuid(token.id), "id token bukan UUID"
    assert token.node_type == "HOST"
    expires = datetime.fromisoformat(token.expires_at.replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    assert timedelta(0) < expires - now <= timedelta(hours=72, minutes=5), (
        f"expires_at di luar rentang TTL: {token.expires_at}"
    )
    assert snapshot.headers.get("x-correlation-id"), "X-Correlation-ID tidak di-echo"


def test_issue_token_non_admin_forbidden(require_w2, member_token):
    """QA-W2-E02 — gate admin: non-admin → 403 FORBIDDEN."""
    snapshot = issue_enrollment_token(require_w2, token=member_token)
    assert snapshot.status_code == 403, f"HTTP {snapshot.status_code}: {snapshot.body_text[:200]!r}"
    assert error_code_of(snapshot) == "FORBIDDEN"


def test_issue_token_requires_auth(require_w2):
    """QA-W2-E03 — tanpa JWT → 401."""
    snapshot = issue_enrollment_token(require_w2, token=None)
    assert snapshot.status_code in (401, 403), f"HTTP {snapshot.status_code}"


def test_enroll_returns_credential_once(require_w2, admin_token, enroll_refs, company_id):
    """QA-W2-E04 — enroll sukses: agent_id UUID + hmac_secret hex-64 (sekali tampil)."""
    model_id, label_id = enroll_refs
    token = parsed_token(issue_enrollment_token(require_w2, token=admin_token))
    snapshot = enroll_agent(
        require_w2,
        enrollment_token=token.token,
        hostname="qa-w2-e04",
        mgmt_ip="10.10.254.10",
        asset_model_id=model_id,
        status_label_id=label_id,
    )
    assert snapshot.status_code == 201, f"HTTP {snapshot.status_code}: {snapshot.body_text[:200]!r}"
    cred = credential_of(snapshot)
    assert is_uuid(cred.agent_id), "agent_id bukan UUID"
    assert is_hex64(cred.hmac_secret), "hmac_secret bukan hex-64 (256-bit)"
    if company_id:
        assert cred.company_id == company_id
    assert "enrollment_token" not in snapshot.body_text, "token bocor di respons enroll"


def test_enroll_token_single_use_atomic(require_w2, admin_token, enroll_refs):
    """QA-W2-E05 — token one-time: pemakaian kedua → 401 UNAUTHORIZED."""
    model_id, label_id = enroll_refs
    token = parsed_token(issue_enrollment_token(require_w2, token=admin_token))
    payload = dict(
        hostname="qa-w2-e05",
        mgmt_ip="10.10.254.11",
        asset_model_id=model_id,
        status_label_id=label_id,
    )
    first = enroll_agent(require_w2, enrollment_token=token.token, **payload)
    assert first.status_code == 201, f"enroll pertama gagal: HTTP {first.status_code}"
    second = enroll_agent(require_w2, enrollment_token=token.token, **payload)
    assert second.status_code == 401, (
        f"token REPLAY diterima (HTTP {second.status_code}) — konsumsi token "
        "tidak one-time atomik!"
    )
    assert error_code_of(second) == "UNAUTHORIZED"
    assert "agent_id" not in second.body_text, "replay membocorkan kredensial agent"


def test_enroll_unknown_token_rejected(require_w2, enroll_refs):
    """QA-W2-E06 — token acak yang tak pernah diterbitkan → 401 generik."""
    model_id, label_id = enroll_refs
    snapshot = enroll_agent(
        require_w2,
        enrollment_token="a" * 64,
        hostname="qa-w2-e06",
        mgmt_ip="10.10.254.12",
        asset_model_id=model_id,
        status_label_id=label_id,
    )
    assert snapshot.status_code == 401, f"HTTP {snapshot.status_code}"
    assert error_code_of(snapshot) == "UNAUTHORIZED"
    body = snapshot.body_text.lower()
    assert "sql" not in body and "panic" not in body, "error membocorkan detail internal"


def test_enroll_missing_required_field(require_w2, admin_token, enroll_refs):
    """QA-W2-E07 — asset_model_id hilang → 400 VALIDATION_ERROR."""
    _, label_id = enroll_refs
    token = parsed_token(issue_enrollment_token(require_w2, token=admin_token))
    snapshot = enroll_agent(
        require_w2,
        enrollment_token=token.token,
        hostname="qa-w2-e07",
        mgmt_ip="10.10.254.13",
        asset_model_id="",  # kosong → wajib ditolak
        status_label_id=label_id,
    )
    assert snapshot.status_code == 400, f"HTTP {snapshot.status_code}: {snapshot.body_text[:200]!r}"
    assert error_code_of(snapshot) == "VALIDATION_ERROR"


def test_issue_token_ttl_clamped(require_w2, admin_token):
    """QA-W2-E08 — ttl_hours=999 di-clamp ke ≤ 72 jam."""
    snapshot = issue_enrollment_token(require_w2, token=admin_token, ttl_hours=999)
    assert snapshot.status_code == 201
    token = parsed_token(snapshot)
    expires = datetime.fromisoformat(token.expires_at.replace("Z", "+00:00"))
    delta = expires - datetime.now(timezone.utc)
    assert delta <= timedelta(hours=72, minutes=5), f"TTL tidak di-clamp: {delta}"
