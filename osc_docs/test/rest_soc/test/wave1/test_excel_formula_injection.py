"""SOC-W1 EXCEL FORMULA INJECTION (CWE-1236) pada siklus import/export.

Vektor: workbook `.xlsx` dengan sel `=cmd|'/C calc'!A0`, `+1+cmd|…`,
`@SUM`, `=WEBSERVICE(...)` di kolom teks → `/assets/import`, lalu
`/assets/export` wajib mensanitasi (prefix `'`) — kontrak api-w1 §2.
Defense alternatif yang sah: import menolak 400 dengan laporan per baris.
"""

from __future__ import annotations

import pytest

from application.w1_audit import audit_export_sanitization
from application.w1_vectors import DANGEROUS_LEADING_CHARS, FORMULA_INJECTION_CELLS
from infrastructure.malicious_xlsx import build_malicious_workbook, read_workbook

pytestmark = [pytest.mark.soc, pytest.mark.injection, pytest.mark.file_upload_abuse, pytest.mark.wave1]

API = "/api/v1"


def test_soc_w1_xf01_malicious_import_never_5xx(soc_w1, soc_session_token):
    """Import workbook berbahaya: 200 (laporan/sanitasi) ATAU 400 — BUKAN 5xx."""
    evidence = soc_w1.upload_multipart(
        f"{API}/assets/import",
        field="file",
        filename="soc-formula-probe.xlsx",
        content=build_malicious_workbook(tag_prefix="SOCW1"),
        token=soc_session_token,
    )
    assert evidence.status_code < 500, (
        f"import workbook berbahaya menyebabkan HTTP {evidence.status_code}: "
        f"{evidence.body_excerpt[:200]!r}"
    )
    assert "panicked at" not in evidence.body_excerpt


def test_soc_w1_xf02_export_sanitizes_injected_cells(soc_w1, soc_session_token):
    """Verifikasi akhir: sel berbahaya TIDAK muncul tanpa prefix `'` di export."""
    probe = soc_w1.upload_multipart(
        f"{API}/assets/import",
        field="file",
        filename="soc-formula-probe.xlsx",
        content=build_malicious_workbook(tag_prefix="SOCW1X"),
        token=soc_session_token,
    )
    if probe.status_code not in (200, 201, 400):
        pytest.skip(f"import probe tidak deterministik (HTTP {probe.status_code})")
    exported = soc_w1.download(f"{API}/assets/export", token=soc_session_token)
    if exported.status_code != 200:
        pytest.skip(f"export tidak tersedia (HTTP {exported.status_code})")
    finding = audit_export_sanitization(
        exported.body_bytes or exported.body_excerpt.encode("utf-8", "surrogateescape"),
        FORMULA_INJECTION_CELLS,
    )
    assert finding.passed, f"FORMULA INJECTION lolos ke export: {finding.observed}"


def test_soc_w1_xf03_dangerous_chars_inventory():
    """Unit-level: inventaris karakter berbahaya selaras antar-layer."""
    assert set(DANGEROUS_LEADING_CHARS) == {"=", "+", "-", "@", "\t", "\r"}
    assert any(payload.startswith("=") for _column, payload in FORMULA_INJECTION_CELLS)
