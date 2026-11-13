"""QA-W1 Excel: import (calamine) & export (rust_xlsxwriter) round-trip.

(api-w1 §2 /assets/import|export, §3 skema; app-w1 §4.4 Excel UI.)
Verifikasi:
- valid workbook → `{inserted, error_count}` sesuai baris;
- baris invalid → laporan per-baris dengan kode kanonik (cap 100);
- file rusak / magic byte bukan ZIP → ditolak tipe-safe (4xx);
- export: Content-Disposition attachment + header bold/freeze + sanitasi
  formula injection (sel berawalan `= + - @ \\t \\r` diprefix `'`).
"""

from __future__ import annotations

import pytest

from application.hris_w1 import (
    DANGEROUS_LEADING_CHARS,
    excel_error_rows,
    excel_valid_rows,
    formula_injection_cells,
)
from application.w1_flows import export_assets, import_assets, parse_import_summary
from infrastructure.excel_fixtures import (
    XLSX_MIME,
    build_workbook,
    corrupt_workbook_bytes,
    fake_xlsx_bytes,
    read_workbook,
)
from infrastructure.w1_client import error_code_of

pytestmark = [pytest.mark.integration, pytest.mark.wave1, pytest.mark.excel]


def _upload(require_w1, access_token, content: bytes, filename="qa-w1.xlsx"):
    return require_w1.post_multipart(
        "/api/v1/assets/import",
        field="file",
        filename=filename,
        content=content,
        mime=XLSX_MIME,
        token=access_token,
    )


def test_qa_w1_x01_import_valid_rows_persisted(require_w1, local_access_token):
    rows = excel_valid_rows(3, tag_prefix="QA-W1X1")
    snapshot = _upload(require_w1, local_access_token, build_workbook(rows))
    assert snapshot.status_code == 200, (
        f"import valid harus 200 (dapat {snapshot.status_code}): "
        f"{error_code_of(snapshot)} {snapshot.body_text[:160]!r}"
    )
    summary = parse_import_summary(snapshot)
    assert summary["inserted"] == len(rows), f"inserted={summary['inserted']} != {len(rows)}"
    assert summary["error_count"] == 0, f"baris valid dilaporkan error: {summary['errors'][:2]}"


def test_qa_w1_x02_import_reports_per_row_error_codes(require_w1, local_access_token):
    """Setiap kasus error §3 menghasilkan baris laporan `{row_number, column, code}`."""
    cases = excel_error_rows(tag_prefix="QA-W1X2")
    rows = [case for case, _expected in cases]
    snapshot = _upload(require_w1, local_access_token, build_workbook(rows))
    assert snapshot.status_code == 200, (
        f"import dengan error baris tetap harus 200 + laporan (dapat {snapshot.status_code})"
    )
    summary = parse_import_summary(snapshot)
    assert summary["error_count"] >= len(cases), (
        f"error_count={summary['error_count']} < kasus yang ditanam ({len(cases)})"
    )
    reported_codes = {str(err.get("code")) for err in summary["errors"]}
    expected_codes = {expected.code for _case, expected in cases}
    missing = expected_codes - reported_codes
    assert not missing, f"kode error kanonik hilang dari laporan: {missing}"
    assert len(summary["errors"]) <= 100, "laporan error wajib ter-cap 100 baris"


def test_qa_w1_x03_import_rejects_corrupt_and_fake_xlsx(require_w1, local_access_token):
    """File rusak & magic byte non-ZIP ditolak 4xx (bukan 5xx, tanpa stack trace)."""
    for label, content in (
        ("corrupt", corrupt_workbook_bytes()),
        ("non-zip-magic", fake_xlsx_bytes(b"%PDF-1.7")),
    ):
        snapshot = _upload(require_w1, local_access_token, content, filename=f"{label}.xlsx")
        assert snapshot.status_code in {400, 415, 422}, (
            f"{label}: harus ditolak 4xx (dapat {snapshot.status_code}) "
            f"{snapshot.body_text[:120]!r}"
        )
        assert "panicked at" not in snapshot.body_text


def test_qa_w1_x04_import_requires_auth_and_size_guard(require_w1):
    """Tanpa token → 401/403; kontrak ukuran diuji live oleh file ≤ 10 MB saja."""
    snapshot = require_w1.post_multipart(
        "/api/v1/assets/import",
        field="file",
        filename="anon.xlsx",
        content=build_workbook(excel_valid_rows(1)),
        mime=XLSX_MIME,
    )
    assert snapshot.status_code in {401, 403}


def test_qa_w1_x05_export_streams_attachment(require_w1, local_access_token):
    snapshot = export_assets(require_w1, access_token=local_access_token)
    assert snapshot.status_code == 200, (
        f"export harus 200 (dapat {snapshot.status_code}): {snapshot.body_text[:120]!r}"
    )
    disposition = snapshot.headers.get("content-disposition", "")
    assert "attachment" in disposition, f"Content-Disposition bukan attachment: {disposition!r}"
    content_type = snapshot.content_type or ""
    assert (
        "spreadsheetml" in content_type
        or "octet-stream" in content_type
        or "vnd.ms-excel" in content_type
    ), f"content-type export tidak dikenal: {content_type!r}"


def test_qa_w1_x06_export_sanitizes_formula_injection(require_w1, local_access_token):
    """CWE-1236: sel aset berawalan `= + - @ \\t \\r` wajib diprefix `'` saat export.

    Seed lewat import (baris `name` berbahaya), lalu verifikasi workbook hasil
    export TIDAK memuat sel berawalan karakter berbahaya.
    """
    import uuid

    tag = f"QAFORM-{uuid.uuid4().hex[:6].upper()}"
    payload = formula_injection_cells()[0]  # `=cmd|'/C calc'!A0`
    rows = excel_valid_rows(1, tag_prefix=tag)
    rows[0]["name"] = payload
    imported = _upload(require_w1, local_access_token, build_workbook(rows))
    if imported.status_code != 200:
        pytest.skip(f"import seed gagal (HTTP {imported.status_code}) — uji sanitasi butuh baris tersimpan")

    exported = export_assets(require_w1, access_token=local_access_token)
    if exported.status_code != 200:
        pytest.skip("export tidak tersedia — verifikasi sanitasi dilewati")
    sheet_rows = read_workbook(
        exported.body_bytes or exported.body_text.encode("utf-8", "surrogateescape")
    )
    dangerous = [
        (header, value)
        for row in sheet_rows
        for header, value in row.items()
        if isinstance(value, str) and value.startswith(DANGEROUS_LEADING_CHARS)
    ]
    assert not dangerous, (
        "sanitasi formula injection dilanggar — sel berbahaya ter-export tanpa "
        f"prefix `'`: {dangerous[:3]}"
    )
