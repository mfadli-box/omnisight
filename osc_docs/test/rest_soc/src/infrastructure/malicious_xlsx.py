"""Workbook `.xlsx` BERBAHAYA (openpyxl) — payload formula injection (CWE-1236).

Hanya untuk target milik workspace (Rules of Engagement). Sel berbahaya
ditanam di kolom teks (asset_tag/name/serial/hostname/model) sesuai skema
import `osc_docs/rest/api-w1.md` §3.
"""

from __future__ import annotations

import io
from typing import Mapping, Sequence

import openpyxl

from application.w1_vectors import FORMULA_INJECTION_CELLS

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


def build_malicious_workbook(
    *, tag_prefix: str = "SOCW1", extra_rows: Sequence[Mapping[str, object]] = ()
) -> bytes:
    """Workbook berisi satu baris per sel formula injection + baris tambahan."""
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append(list(HEADERS))
    for index, (column, payload) in enumerate(FORMULA_INJECTION_CELLS, start=1):
        row: dict[str, object] = {
            "asset_tag": f"{tag_prefix}-{index:04d}",
            "name": "SOC Formula Probe",
            "node_type": "HOST",
        }
        row[column] = payload
        sheet.append([row.get(header) for header in HEADERS])
    for row in extra_rows:
        sheet.append([row.get(header) for header in HEADERS])
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def read_workbook(content: bytes) -> list[dict[str, object]]:
    """Baca sheet pertama verbatim (untuk memverifikasi hasil sanitasi export)."""
    workbook = openpyxl.load_workbook(io.BytesIO(content), data_only=False)
    sheet = workbook.worksheets[0]
    header_row = [cell.value for cell in sheet[1]]
    parsed: list[dict[str, object]] = []
    for row in sheet.iter_rows(min_row=2, values_only=True):
        if all(value is None for value in row):
            continue
        parsed.append(
            {str(header): value for header, value in zip(header_row, row) if header is not None}
        )
    return parsed
