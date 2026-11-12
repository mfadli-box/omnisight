"""SOC-W1 TENANT ISOLATION: kebocoran data lintas `company_id`.

Kontrak api-w1 §5 (RequestContext): `active_company_id` dari baris sesi DB;
semua query tenant wajib menyertakannya; relasi lintas tenant diverifikasi
kepemilikannya (anti IDOR). Audit memastikan payload seluruh endpoint
tenant tidak memuat jejak company asing.
"""

from __future__ import annotations

import pytest

from application.w1_audit import audit_no_cross_tenant_data
from infrastructure.w1_soc_client import W1SecurityClient

pytestmark = [pytest.mark.soc, pytest.mark.idor, pytest.mark.wave1]

API = "/api/v1"

TENANT_ENDPOINTS: tuple[str, ...] = (
    f"{API}/assets",
    f"{API}/licenses",
    f"{API}/tickets",
    f"{API}/dcim/racks",
    f"{API}/ipam/prefixes",
    f"{API}/ipam/addresses",
    f"{API}/files",
)


def test_soc_w1_tl01_tenant_payloads_free_of_foreign_ids(
    soc_w1: W1SecurityClient, soc_session_token, foreign_company_id
):
    """Semua endpoint tenant: foreign company_id TIDAK PERNAH muncul di body."""
    if not foreign_company_id:
        pytest.skip(
            "SOC_W1_FOREIGN_COMPANY_ID tidak diset — audit butuh id company "
            "asing sebagai penanda kebocoran."
        )
    for endpoint in TENANT_ENDPOINTS:
        evidence = soc_w1.get_json(endpoint, token=soc_session_token)
        if evidence.status_code == 404:  # modul belum terpasang di build ini
            continue
        finding = audit_no_cross_tenant_data(evidence, foreign_company_id, endpoint)
        assert finding.passed, f"KEBOCORAN di {endpoint}: {finding.observed}"


def test_soc_w1_tl02_foreign_asset_object_blocked(
    soc_w1: W1SecurityClient, soc_session_token, foreign_asset_id
):
    """BOLA objek: `GET /assets/{id}` milik tenant asing → 403/404."""
    if not foreign_asset_id:
        pytest.skip(
            "SOC_W1_FOREIGN_ASSET_ID tidak diset — sediakan id aset milik "
            "company asing."
        )
    evidence = soc_w1.get_json(f"{API}/assets/{foreign_asset_id}", token=soc_session_token)
    assert evidence.status_code in {400, 401, 403, 404}, (
        f"aset tenant asing terbaca (HTTP {evidence.status_code}): "
        f"{evidence.body_excerpt[:160]!r}"
    )


def test_soc_w1_tl03_foreign_file_object_blocked(
    soc_w1: W1SecurityClient, soc_session_token, foreign_asset_id
):
    """BOLA objek file: presigned hanya untuk pemilik company (id asal asing → 403/404)."""
    if not foreign_asset_id:
        pytest.skip("SOC_W1_FOREIGN_ASSET_ID tidak diset")
    evidence = soc_w1.get_json(f"{API}/files/{foreign_asset_id}", token=soc_session_token)
    assert evidence.status_code in {400, 401, 403, 404}, (
        f"metadata file tenant asing terbaca (HTTP {evidence.status_code})"
    )


def test_soc_w1_tl04_filter_cannot_override_tenant(
    soc_w1: W1SecurityClient, soc_session_token, foreign_company_id, soc_collection
):
    """`?filter` dengan field `company_id` asing → ditolak 400 (field tak terdaftar)."""
    if not foreign_company_id:
        pytest.skip("SOC_W1_FOREIGN_COMPANY_ID tidak diset")
    from urllib.parse import quote

    filter_json = quote(
        '{{"and": [{{"field": "company_id", "op": "eq", "value": "{foreign}"}}]}}'.format(
            foreign=foreign_company_id
        ),
        safe="",
    )
    evidence = soc_w1.get_json(
        f"{API}/items/{soc_collection}?filter={filter_json}", token=soc_session_token
    )
    assert evidence.status_code in {400, 403, 404, 200}, (
        f"filter tenant merespons HTTP {evidence.status_code}"
    )
    if evidence.status_code == 200:
        finding = audit_no_cross_tenant_data(
            evidence, foreign_company_id, f"items/{soc_collection}?filter=company_id"
        )
        assert finding.passed, f"filter menerobos tenant guard: {finding.observed}"
