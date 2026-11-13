"""Fixture builder .xlsx (openpyxl) — dinamis untuk import/export QA.

Kontrak skema: `osc_docs/rest/api-w1.md` §3 (kolom A..I, 10 MB / 10.000
baris). Reader ringkas dipakai untuk memverifikasi cell type & sanitasi
formula injection pada hasil export.
"""

from __future__ import annotations

import io
from typing import Any, Mapping, Sequence

import openpyxl
from openpyxl.styles import Font

HEADERS: tuple[str, ...] = (
    "asset_tag",
    "name",
    "model_name",
    "status_label",
    "node_type",
    "serial_number",
    "hostname",
    "mgmt_ip",
    "purchase_cost",
)

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def build_workbook(rows: Sequence[Mapping[str, Any]], *, headers: Sequence[str] = HEADERS) -> bytes:
    """Bangun workbook `.xlsx` (sheet pertama, header baris 1, inline values)."""
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append(list(headers))
    for row in rows:
        sheet.append([row.get(header) for header in headers])
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def read_workbook(content: bytes) -> list[dict[str, Any]]:
    """Baca sheet pertama → list of `{header: value}` (verbatim, tanpa evaluasi)."""
    workbook = openpyxl.load_workbook(io.BytesIO(content), data_only=False)
    sheet = workbook.worksheets[0]
    header_row = [cell.value for cell in sheet[1]]
    parsed: list[dict[str, Any]] = []
    for row in sheet.iter_rows(min_row=2, values_only=True):
        if all(value is None for value in row):
            continue
        parsed.append(
            {str(header): value for header, value in zip(header_row, row) if header is not None}
        )
    return parsed


def corrupt_workbook_bytes() -> bytes:
    """Bytes `.xlsx` rusak (truncated) — uji kegagalan parse yang tipe-safe."""
    valid = build_workbook([{"asset_tag": "CORRUPT-1", "name": "rusak"}])
    return valid[: len(valid) // 2]


def fake_xlsx_bytes(real_magic: bytes) -> bytes:
    """File ber-ekstensi `.xlsx` dengan magic bytes BUKAN ZIP (PK\\x03\\x04)."""
    return real_magic + b"bukan-workbook-asli"
