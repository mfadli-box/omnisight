"""SOC-W1 AUTH-BYPASS: `mfa_challenge_token` ke endpoint bisnis.

Kontrak api-w1 §5: challenge JWT 5 menit `scope=mfa_pending` HANYA berlaku
di `/api/v1/auth/mfa/*` — middleware wajib menolak path lain. Audit memakai
token PALSU (alg:none, signature sampah, expired, scope-confusion) ke
endpoint bisnis: semua wajib ditolak 401/403 (OWASP API2:2023, CWE-347).
"""

from __future__ import annotations

import pytest

from application.w1_audit import audit_challenge_rejected
from application.w1_vectors import BUSINESS_ENDPOINTS, forged_challenge_tokens
from infrastructure.w1_soc_client import W1SecurityClient

pytestmark = [pytest.mark.soc, pytest.mark.auth_bypass, pytest.mark.wave1]


def test_soc_w1_ab01_forged_challenge_tokens_rejected_on_business_endpoints(
    soc_w1: W1SecurityClient,
):
    """Setiap token palsu × setiap endpoint bisnis → 401/403, tanpa 2xx/5xx."""
    for forged in forged_challenge_tokens():
        for endpoint in BUSINESS_ENDPOINTS:
            evidence = soc_w1.get_json(endpoint, token=forged.token)
            finding = audit_challenge_rejected(
                evidence, endpoint, forged.label, f"SOC-W1-001-{forged.label}"
            )
            assert finding.passed, (
                f"BYPASS terdeteksi: {forged.note} → {endpoint}: "
                f"HTTP {evidence.status_code} {evidence.body_excerpt[:120]!r}"
            )


def test_soc_w1_ab02_forged_challenge_rejected_on_switch_company(soc_w1: W1SecurityClient):
    """`switch-company` juga endpoint bisnis — challenge token tidak cukup."""
    for forged in forged_challenge_tokens():
        evidence = soc_w1.post_json(
            "/api/v1/auth/switch-company",
            {"company_id": "00000000-0000-0000-0000-000000000000"},
            token=forged.token,
        )
        assert evidence.status_code in {400, 401, 403, 404}, (
            f"{forged.label}: switch-company merespons {evidence.status_code} "
            f"untuk token palsu — {evidence.body_excerpt[:120]!r}"
        )


def test_soc_w1_ab03_challenge_token_never_grants_items_write(soc_w1: W1SecurityClient):
    """Write path `items/{collection}` wajib menolak scope=mfa_pending palsu."""
    forged = forged_challenge_tokens()[0]  # alg:none, scope=mfa_pending
    evidence = soc_w1.post_json(
        "/api/v1/items/qa_soc_wave1", {"data": {"injected": True}}, token=forged.token
    )
    assert evidence.status_code in {400, 401, 403, 404}, (
        f"scope mfa_pending palsu diterima di write path "
        f"(HTTP {evidence.status_code}): {evidence.body_excerpt[:120]!r}"
    )
