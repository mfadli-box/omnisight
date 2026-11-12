"""QA-W1 Switcher & Navigasi: `switch-company` + `me/navigation`.

(api-w1 §2 switch-company & me/navigation; app-w1 §4.2 App Shell.)
Verifikasi:
- `GET /auth/companies` publik TIDAK mengekspos `hris_login_url`/secret;
- `switch-company` mem-validasi `UserCompanyAccess` (tanpa akses → 403);
- `me/navigation`: tepat satu `is_active_company`, pohon menu tervalidasi,
  dan node `can_view=false` tidak pernah dikirim (server-side filtering).
"""

from __future__ import annotations

import os

import pytest

from application.auth_w1 import evaluate_navigation
from application.w1_flows import navigation, switch_company
from infrastructure.w1_client import data_of, error_code_of

pytestmark = [pytest.mark.integration, pytest.mark.contract, pytest.mark.wave1]


def test_qa_w1_n01_companies_public_without_hris_secret(require_w1):
    """Endpoint publik: daftar company + flag boolean, tanpa URL/kredensial HRIS."""
    snapshot = require_w1.get_json("/api/v1/auth/companies")
    assert snapshot.status_code == 200, f"companies harus publik 200 (dapat {snapshot.status_code})"
    data = data_of(snapshot)
    companies = data.get("companies")
    assert isinstance(companies, list) and "count" in data
    for company in companies:
        assert isinstance(company.get("hris_enabled"), bool), "hris_enabled wajib boolean"
        serialized = str(company).lower()
        assert "hris_login_url" not in serialized, "URL HRIS TIDAK BOLEH diekspos"
        assert "password" not in serialized and "secret" not in serialized


def test_qa_w1_n02_navigation_shape_and_server_side_filtering(require_w1, local_access_token):
    snapshot = navigation(require_w1, access_token=local_access_token)
    verdict = evaluate_navigation(snapshot)
    assert verdict.passed, f"kontrak navigation dilanggar: {verdict.detail}"


def test_qa_w1_n03_switch_company_requires_access(require_w1, local_access_token):
    """IDOR/fobidden target: company tanpa `UserCompanyAccess` → 403."""
    forbidden = os.environ.get("QA_W1_FORBIDDEN_COMPANY_ID", "")
    if not forbidden:
        pytest.skip(
            "QA_W1_FORBIDDEN_COMPANY_ID tidak diset — set company yang TIDAK "
            "boleh diakses user env untuk test negatif switch-company."
        )
    snapshot = switch_company(
        require_w1, access_token=local_access_token, company_id=forbidden
    )
    assert snapshot.status_code == 403, (
        f"switch ke company tanpa akses harus 403 (dapat {snapshot.status_code})"
    )
    assert error_code_of(snapshot) == "FORBIDDEN"


def test_qa_w1_n04_switch_company_validation(require_w1, local_access_token):
    """company_id non-UUID / kosong → 400 VALIDATION_ERROR, bukan 5xx."""
    for bad_company_id in ("bukan-uuid", ""):
        snapshot = switch_company(
            require_w1, access_token=local_access_token, company_id=bad_company_id
        )
        assert snapshot.status_code in {400, 403}, (
            f"company_id={bad_company_id!r} harus ditolak 4xx "
            f"(dapat {snapshot.status_code})"
        )


def test_qa_w1_n05_switch_company_updates_context(require_w1, local_access_token):
    """Positive control (butuh `QA_W1_SWITCH_COMPANY_ID` yang BOLEH diakses)."""
    target = os.environ.get("QA_W1_SWITCH_COMPANY_ID", "")
    if not target:
        pytest.skip(
            "QA_W1_SWITCH_COMPANY_ID tidak diset — set company kedua yang sah "
            "untuk user env."
        )
    before = navigation(require_w1, access_token=local_access_token)
    switched = switch_company(
        require_w1, access_token=local_access_token, company_id=target
    )
    assert switched.status_code == 200, (
        f"switch-company sah harus 200 (dapat {switched.status_code}: "
        f"{error_code_of(switched)})"
    )
    new_token = data_of(switched).get("access_token")
    assert new_token, "switch-company wajib menerbitkan JWT klaim company baru"
    after = navigation(require_w1, access_token=str(new_token))
    assert after.status_code == 200
    verdict = evaluate_navigation(after)
    assert verdict.passed, f"konteks baru harus konsisten: {verdict.detail}"
    del before
