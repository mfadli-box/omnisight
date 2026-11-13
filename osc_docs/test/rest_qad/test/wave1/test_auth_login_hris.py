"""QA-W1 AUTH: Local Login + login dual-mode HRIS (api-w1 §1–2, app-w1 §4.1).

Live test (skip otomatis bila target mati / env kredensial kosong).
Verifikasi:
- Local Login (`company_id=""`) → Argon2id lokal, envelope sesuai kontrak;
- HRIS `1|` → sukses + auto-sync (`last_hris_sync_at`, `offline_cache=false`);
- HRIS `0|…|NONE` → 401 TANPA fallback ke cache offline;
- HRIS timeout / non-XML → fallback cache offline ATAU 502 yang tipe-safe.
"""

from __future__ import annotations

import pytest

from application.auth_w1 import evaluate_envelope_error, evaluate_login_success
from application.hris_w1 import HRIS_REJECT_PREFIX, HRIS_SUCCESS_PREFIX, expected_hris_outcome
from application.w1_flows import login
from domain.models_w1 import HrisStubMode
from infrastructure.hris_stub import HrisAsmxStub, stub_response_body
from infrastructure.w1_client import error_code_of

pytestmark = [pytest.mark.integration, pytest.mark.contract, pytest.mark.wave1]

STUB_PORT = int(__import__("os").environ.get("QA_W1_HRIS_STUB_PORT", "18901"))


# --- Local Login -------------------------------------------------------------


def test_qa_w1_a01_local_login_matches_contract(require_w1, local_account):
    username, password = local_account
    snapshot = login(require_w1, username=username, password=password)
    verdict = evaluate_login_success(snapshot, expect_mfa=False)
    assert verdict.passed, f"kontrak login lokal dilanggar: {verdict.detail}"


def test_qa_w1_a02_local_login_wrong_password_is_401_envelope(require_w1, local_account):
    username, _ = local_account
    snapshot = login(require_w1, username=username, password="salah-bukan-password")
    assert snapshot.status_code == 401, f"harusnya 401, dapat {snapshot.status_code}"
    verdict = evaluate_envelope_error(snapshot)
    assert verdict.passed, f"envelope error dilanggar: {verdict.detail}"
    assert error_code_of(snapshot) == "UNAUTHORIZED"


def test_qa_w1_a03_local_login_validation_error_on_blank_username(require_w1):
    snapshot = login(require_w1, username="", password="x")
    assert snapshot.status_code == 400
    assert error_code_of(snapshot) == "VALIDATION_ERROR"


def test_qa_w1_a04_local_login_correlation_id_echoed(require_w1, local_account):
    username, password = local_account
    snapshot = login(require_w1, username=username, password=password)
    assert snapshot.headers.get("x-correlation-id"), "X-Correlation-ID wajib di-echo"


# --- HRIS dual-mode (stub ASMX) -----------------------------------------------


@pytest.fixture()
def hris_stub():
    stub = HrisAsmxStub(port=STUB_PORT)
    stub.start()
    stub.set_mode(HrisStubMode.OK)
    yield stub
    stub.stop()


def test_qa_w1_a05_hris_prefix_constants_match_stub_contract():
    """Unit-level: konstanta kontrak stub HRIS (1| sukses, 0|…|NONE ditolak)."""
    assert stub_response_body(HrisStubMode.OK).startswith(HRIS_SUCCESS_PREFIX.encode())
    assert stub_response_body(HrisStubMode.INVALID).startswith(HRIS_REJECT_PREFIX.encode())
    assert b"NONE" in stub_response_body(HrisStubMode.INVALID)
    assert not stub_response_body(HrisStubMode.NON_XML).lstrip().startswith(b"<?xml")


def test_qa_w1_a06_hris_ok_syncs_profile(require_w1, hris_company, hris_stub, hris_cache_ttl_ok):
    """`1|` → auto-sync profil + cache Argon2id (`last_hris_sync_at` terisi)."""
    company_id, username, password = hris_company
    hris_stub.set_mode(HrisStubMode.OK)
    outcome = expected_hris_outcome(
        HrisStubMode.OK, cache_available=True, cache_within_ttl=hris_cache_ttl_ok
    )
    snapshot = login(require_w1, username=username, password=password, company_id=company_id)
    assert outcome.matches(
        snapshot.status_code, error_code_of(snapshot), _offline_cache_flag(snapshot)
    ), (
        f"HRIS 1| harus sync profil + cache (HTTP {snapshot.status_code}, "
        f"code={error_code_of(snapshot)}): {snapshot.body_text[:160]!r}"
    )
    user = (snapshot.body_json or {}).get("data", {}).get("user", {}) if snapshot.body_json else {}
    if snapshot.status_code == 200:
        assert user.get("last_hris_sync_at"), "auto-sync `last_hris_sync_at` wajib terisi"


def test_qa_w1_a07_hris_reject_never_falls_back(require_w1, hris_company, hris_stub):
    """`0|…|NONE` → 401 UNAUTHORIZED TANPA fallback cache offline."""
    company_id, username, password = hris_company
    hris_stub.set_mode(HrisStubMode.INVALID)
    outcome = expected_hris_outcome(HrisStubMode.INVALID, cache_available=True, cache_within_ttl=True)
    snapshot = login(require_w1, username=username, password=password, company_id=company_id)
    assert outcome.matches(snapshot.status_code, error_code_of(snapshot), _offline_cache_flag(snapshot)), (
        f"HRIS 0|…|NONE harus 401 tanpa fallback (dapat HTTP {snapshot.status_code})"
    )


def test_qa_w1_a08_hris_non_xml_falls_back_or_502(
    require_w1, hris_company, hris_stub, hris_cache_ttl_ok
):
    """Upstream non-XML → cache offline (200, offline_cache=true) atau 502 tipe-safe."""
    company_id, username, password = hris_company
    hris_stub.set_mode(HrisStubMode.NON_XML)
    outcome = expected_hris_outcome(
        HrisStubMode.NON_XML, cache_available=True, cache_within_ttl=hris_cache_ttl_ok
    )
    snapshot = login(require_w1, username=username, password=password, company_id=company_id)
    assert outcome.matches(snapshot.status_code, error_code_of(snapshot), _offline_cache_flag(snapshot)), (
        "upstream non-XML harus offline-cache fallback ATAU 502 "
        "HRIS_UPSTREAM_INVALID_RESPONSE (tanpa stack trace): "
        f"HTTP {snapshot.status_code} {snapshot.body_text[:160]!r}"
    )
    if snapshot.status_code == 502:
        assert "panicked at" not in snapshot.body_text


def test_qa_w1_a09_hris_timeout_falls_back_or_502(
    require_w1, hris_company, hris_cache_ttl_ok
):
    """Upstream hang (melewati timeout 8 s) → offline cache atau 502 tipe-safe."""
    company_id, username, password = hris_company
    stub = HrisAsmxStub(port=STUB_PORT, slow_seconds=12)
    stub.start()
    try:
        stub.set_mode(HrisStubMode.SLOW)
        outcome = expected_hris_outcome(
            HrisStubMode.SLOW, cache_available=True, cache_within_ttl=hris_cache_ttl_ok
        )
        snapshot = login(
            require_w1, username=username, password=password, company_id=company_id
        )
        assert outcome.matches(
            snapshot.status_code, error_code_of(snapshot), _offline_cache_flag(snapshot)
        ), f"timeout HRIS harus fallback offline / 502 (dapat HTTP {snapshot.status_code})"
    finally:
        stub.stop()


def _offline_cache_flag(snapshot) -> bool | None:
    if snapshot.body_json and isinstance(snapshot.body_json.get("data"), dict):
        value = snapshot.body_json["data"].get("offline_cache")
        return bool(value) if value is not None else None
    return None
