"""SOC-W1 IDOR: `switch-company` ke company ilegal (OWASP API1:2023, CWE-639).

Kontrak api-w1 §2: validasi baris `UserCompanyAccess` aktif sebelum
`user_sessions.active_company_id` diubah; konteks diambil dari BARIS SESI
DB (bukan klaim JWT mentah). Audit mencoba pindah ke company yang tidak
boleh diakses + payload malformed, lalu memastikan konteks tidak berpindah.
"""

from __future__ import annotations

import pytest

from application.w1_audit import audit_switch_company_idor
from application.w1_vectors import FORBIDDEN_SWITCH_PAYLOADS

pytestmark = [pytest.mark.soc, pytest.mark.idor, pytest.mark.wave1]

API = "/api/v1"


def test_soc_w1_id01_switch_to_foreign_company_rejected(soc_w1, soc_session_token, foreign_company_id):
    """Company milik tenant lain (tanpa `UserCompanyAccess`) → 403/404."""
    if not foreign_company_id:
        pytest.skip(
            "SOC_W1_FOREIGN_COMPANY_ID tidak diset — sediakan uuid company asing "
            "untuk audit IDOR switch-company."
        )
    evidence = soc_w1.post_json(
        f"{API}/auth/switch-company",
        {"company_id": foreign_company_id},
        token=soc_session_token,
    )
    finding = audit_switch_company_idor(evidence, foreign_company_id)
    assert finding.passed, f"IDOR switch-company: {finding.observed}"


def test_soc_w1_id02_switch_company_malformed_payloads(soc_w1, soc_session_token):
    """Non-UUID / kosong / traversal / SQLi pada company_id → 4xx, tanpa 5xx."""
    for payload in FORBIDDEN_SWITCH_PAYLOADS:
        evidence = soc_w1.post_json(
            f"{API}/auth/switch-company", {"company_id": payload}, token=soc_session_token
        )
        assert evidence.status_code in {400, 401, 403, 404}, (
            f"company_id={payload[:32]!r} merespons HTTP {evidence.status_code}: "
            f"{evidence.body_excerpt[:120]!r}"
        )


def test_soc_w1_id03_failed_switch_keeps_context(soc_w1, soc_session_token, foreign_company_id):
    """Setelah switch ditolak, konteks sesi TIDAK berpindah (`me/navigation`)."""
    if not foreign_company_id:
        pytest.skip("SOC_W1_FOREIGN_COMPANY_ID tidak diset")
    before = soc_w1.get_json(f"{API}/me/navigation", token=soc_session_token)
    soc_w1.post_json(
        f"{API}/auth/switch-company",
        {"company_id": foreign_company_id},
        token=soc_session_token,
    )
    after = soc_w1.get_json(f"{API}/me/navigation", token=soc_session_token)
    assert after.status_code == 200 and before.status_code == 200
    assert after.body_excerpt == before.body_excerpt or _active_company(after) == _active_company(before), (
        "konteks company berubah meskipun switch ditolak — tenant guard bocor"
    )
    foreign_not_active = not after.body_excerpt.__contains__(f'"company_id": "{foreign_company_id}"')
    assert foreign_not_active or _active_company(after) != foreign_company_id, (
        "company asing menjadi is_active_company setelah switch ditolak"
    )


def _active_company(evidence) -> str:
    body = evidence.body_excerpt
    marker = '"is_active_company": true'
    if marker not in body:
        return ""
    segment = body[max(0, body.find(marker) - 400) : body.find(marker)]
    start = segment.rfind('"id": "')
    if start < 0:
        return ""
    tail = segment[start + len('"id": " ') :]
    return tail.split('"', 1)[0]
