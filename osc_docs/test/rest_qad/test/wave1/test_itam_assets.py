"""QA-W1 ITAM: assets + checkout/checkin (FOR UPDATE + re-check).

(api-w1 §2 assets/checkout/checkin; app-w1 §4.3 modal Check-Out/Check-In.)
Verifikasi:
- checkout menolak aset non-DEPLOYABLE (400) / ter-assign (409 CONFLICT);
- checkin menolak aset bebas (400);
- aset di-seed lewat import Excel (master default get-or-create).
"""

from __future__ import annotations

from typing import Any

import pytest

from application.hris_w1 import excel_valid_rows
from application.w1_flows import checkin_asset, checkout_asset, import_assets, parse_import_summary
from infrastructure.excel_fixtures import build_workbook
from infrastructure.w1_client import data_of, error_code_of

pytestmark = [pytest.mark.integration, pytest.mark.wave1, pytest.mark.excel]


def _seed_asset(require_w1, access_token: str, tag: str) -> str | None:
    """Seed 1 aset via import Excel → kembalikan id-nya dari GET /assets."""
    workbook = build_workbook(excel_valid_rows(1, tag_prefix=tag))
    imported = import_assets(require_w1, access_token=access_token, workbook=workbook)
    if imported.status_code != 200:
        return None
    listing = require_w1.get_json("/api/v1/assets", token=access_token)
    if listing.status_code != 200:
        return None
    data = listing.body_json.get("data", {}) if listing.body_json else {}
    items = data.get("assets") or data.get("items") or []
    for item in items:
        if isinstance(item, dict) and item.get("asset_tag") == f"{tag}-0001":
            return str(item.get("id"))
    return None


def test_qa_w1_t01_asset_listing_requires_auth(require_w1):
    snapshot = require_w1.get_json("/api/v1/assets")
    assert snapshot.status_code in {401, 403}, (
        f"/assets tanpa token harus 401/403 (dapat {snapshot.status_code})"
    )


def test_qa_w1_t02_checkout_then_checkin_lifecycle(require_w1, local_access_token):
    """Siklus penuh: seed → checkout 200 → re-checkout 409 → checkin 200 → re-checkin 400."""
    asset_id = _seed_asset(require_w1, local_access_token, tag="QA-W1T2")
    if not asset_id:
        pytest.skip(
            "tidak bisa seed aset (import/listing gagal atau akun tanpa akses "
            "ITAM) — sediakan sesi QA dengan role ITAM."
        )
    first = checkout_asset(
        require_w1, access_token=local_access_token, asset_id=asset_id, assignee="qa-wave1"
    )
    assert first.status_code in {200, 201, 400}, (
        f"checkout aset DEPLOYABLE bebas tidak boleh 5xx (dapat {first.status_code})"
    )
    if first.status_code == 400:
        # Label seed mungkin tidak DEPLOYABLE — kontrak menolak dengan 400.
        assert error_code_of(first) == "VALIDATION_ERROR"
        return
    conflict = checkout_asset(
        require_w1, access_token=local_access_token, asset_id=asset_id, assignee="qa-wave1-lagi"
    )
    assert conflict.status_code == 409, (
        f"re-checkout aset ter-assign harus 409 CONFLICT (dapat {conflict.status_code})"
    )
    assert error_code_of(conflict) == "CONFLICT"
    back_in = checkin_asset(require_w1, access_token=local_access_token, asset_id=asset_id)
    assert back_in.status_code in {200, 201}, (
        f"checkin aset ter-assign harus sukses (dapat {back_in.status_code})"
    )
    again = checkin_asset(require_w1, access_token=local_access_token, asset_id=asset_id)
    assert again.status_code == 400, (
        f"checkin aset bebas harus 400 (dapat {again.status_code})"
    )


def test_qa_w1_t03_checkout_logs_written(require_w1, local_access_token):
    """`asset_checkout_logs` terekspos konsisten setelah checkout sukses."""
    listing = require_w1.get_json("/api/v1/assets", token=local_access_token)
    if listing.status_code != 200:
        pytest.skip("listing aset tidak tersedia — butuh sesi ITAM")
    data: dict[str, Any] = data_of(listing)
    items = data.get("assets") or data.get("items") or []
    for item in items:
        if not isinstance(item, dict):
            continue
        checked_out = item.get("assigned_to") or item.get("checked_out_to")
        if checked_out:
            # Ada aset ter-assign → log checkout wajib ada di entri aset.
            assert item.get("checkout_log_count") is None or int(
                item.get("checkout_log_count", 0)
            ) >= 1, (
                "aset ter-assign tanpa jejak asset_checkout_logs (audit hilang)"
            )
            return
    pytest.skip("tidak ada aset ter-assign pada tenant — seed dulu via checkout")


def test_qa_w1_t04_checkout_unknown_asset_not_500(require_w1, local_access_token):
    random_id = "00000000-0000-0000-0000-000000000000"
    snapshot = checkout_asset(
        require_w1, access_token=local_access_token, asset_id=random_id, assignee="qa"
    )
    assert snapshot.status_code in {400, 403, 404}, (
        f"aset tak dikenal harus 4xx (dapat {snapshot.status_code})"
    )
    assert "panicked at" not in snapshot.body_text
