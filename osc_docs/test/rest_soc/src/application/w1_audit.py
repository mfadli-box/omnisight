"""Use case audit keamanan Wave 1 — bukti masuk, `SecurityFinding` keluar.

Murni (tanpa I/O): menerima `AuditEvidence` / bytes dari test, menghasilkan
temuan yang dapat dilaporkan langsung ke laporan SOC.
"""

from __future__ import annotations

import io
import json
from typing import Any, Mapping, Sequence

from domain.findings import AuditEvidence, SecurityFinding, Severity

from application.w1_vectors import (
    DANGEROUS_LEADING_CHARS,
    SQL_ERROR_MARKERS,
)

REJECTED_STATUSES = {401, 403, 404}
IDOR_REJECTED_STATUSES = {400, 401, 403, 404}


def _finding(
    finding_id: str,
    owasp: str,
    cwe: str,
    vector: str,
    expected: str,
    observed: str,
    passed: bool,
    severity: Severity = Severity.HIGH,
) -> SecurityFinding:
    return SecurityFinding(
        finding_id=finding_id,
        owasp_category=owasp,
        cwe=cwe,
        vector=vector,
        expected_defense=expected,
        observed=observed,
        severity=severity,
        passed=passed,
    )


def json_body(evidence: AuditEvidence) -> Mapping[str, Any] | None:
    try:
        parsed = json.loads(evidence.body_excerpt)
    except ValueError:
        return None
    return parsed if isinstance(parsed, Mapping) else None


def error_code(evidence: AuditEvidence) -> str | None:
    body = json_body(evidence)
    if not body:
        return None
    error = body.get("error")
    return error.get("code") if isinstance(error, Mapping) else None


def audit_challenge_rejected(
    evidence: AuditEvidence, endpoint: str, label: str, finding_id: str
) -> SecurityFinding:
    """`mfa_challenge_token` palsu ke endpoint bisnis WAJIB ditolak."""
    vector = f"POST/GET {endpoint} dengan token palsu [{label}]"
    expected = "401/403 (JWT tak valid atau scope bukan access) — bukan 2xx/5xx"
    if evidence.status_code in REJECTED_STATUSES:
        return _finding(
            finding_id,
            "API2:2023 Broken Authentication",
            "CWE-347",
            vector,
            expected,
            f"ditolak HTTP {evidence.status_code} ({error_code(evidence) or 'tanpa kode'})",
            True,
            Severity.HIGH,
        )
    return _finding(
        finding_id,
        "API2:2023 Broken Authentication",
        "CWE-347",
        vector,
        expected,
        f"status HTTP {evidence.status_code} (bypass mungkin!)",
        False,
        Severity.CRITICAL,
    )


def audit_totp_replay(first: AuditEvidence, second: AuditEvidence) -> SecurityFinding:
    """Replay OTP: kode yang sama dipakai dua kali → kedua panggilan ke-2 wajib 4xx."""
    vector = "POST /auth/mfa/verify dengan OTP yang SAMA dua kali (anti-replay step)"
    if second.status_code in IDOR_REJECTED_STATUSES:
        return _finding(
            "SOC-W1-002",
            "API2:2023 Broken Authentication",
            "CWE-294",
            vector,
            "pemakaian kedua ditolak 4xx (mfa_last_verified_step)",
            f"replay ditolak HTTP {second.status_code}",
            True,
            Severity.HIGH,
        )
    return _finding(
        "SOC-W1-002",
        "API2:2023 Broken Authentication",
        "CWE-294",
        vector,
        "pemakaian kedua ditolak 4xx (mfa_last_verified_step)",
        f"replay diterima HTTP {second.status_code} — anti-replay gagal!",
        False,
        Severity.CRITICAL,
    )


def audit_switch_company_idor(evidence: AuditEvidence, company_id: str) -> SecurityFinding:
    """`switch-company` ke company tanpa `UserCompanyAccess` wajib 403/404."""
    vector = f"POST /auth/switch-company company_id={company_id[:24]}…"
    if evidence.status_code in {403, 404}:
        return _finding(
            "SOC-W1-003",
            "API1:2023 BOLA (IDOR)",
            "CWE-639",
            vector,
            "403 FORBIDDEN / 404 — tenant guard berbasis baris sesi",
            f"ditolak HTTP {evidence.status_code} ({error_code(evidence) or 'tanpa kode'})",
            True,
            Severity.HIGH,
        )
    return _finding(
        "SOC-W1-003",
        "API1:2023 BOLA (IDOR)",
        "CWE-639",
        vector,
        "403 FORBIDDEN / 404 — tenant guard berbasis baris sesi",
        f"status HTTP {evidence.status_code} — konteks company berpindah tanpa akses!",
        False,
        Severity.CRITICAL,
    )


def audit_no_cross_tenant_data(
    evidence: AuditEvidence, foreign_company_id: str, label: str
) -> SecurityFinding:
    """Tidak boleh ada data/company_id milik tenant asing pada payload."""
    vector = f"enumerasi lintas tenant via {label}"
    body = evidence.body_excerpt
    leaked = foreign_company_id and foreign_company_id in body
    passed = (
        evidence.status_code < 500
        and not leaked
        and not any(marker in body.lower() for marker in ("panicked at", "backtrace"))
    )
    observed = (
        f"HTTP {evidence.status_code}, tanpa data tenant asing"
        if passed
        else f"HTTP {evidence.status_code}, kebocoran terdeteksi: foreign id di body"
        if leaked
        else f"HTTP {evidence.status_code}, error internal bocor"
    )
    return _finding(
        "SOC-W1-004",
        "API1:2023 BOLA / API3:2023 Broken Object Property Level Authorization",
        "CWE-639",
        vector,
        "payload hanya berisi data company aktif; foreign id tidak pernah muncul",
        observed,
        passed,
        Severity.HIGH,
    )


def audit_filter_sqli(evidence: AuditEvidence, probe_id: str) -> SecurityFinding:
    """Filter AST berbahaya: tidak boleh 5xx, tidak boleh bocor error SQL."""
    vector = f"GET /items/{{collection}}?filter=… probe {probe_id}"
    body = evidence.body_excerpt.lower()
    leaked = next((marker for marker in SQL_ERROR_MARKERS if marker in body), None)
    passed = evidence.status_code < 500 and leaked is None
    observed = (
        f"HTTP {evidence.status_code} (ditolak/di-bind, tanpa error SQL)"
        if passed
        else f"HTTP {evidence.status_code}, marker error internal: {leaked!r}"
    )
    return _finding(
        "SOC-W1-005",
        "API8:2023 Security Misconfiguration (SQL Injection)",
        "CWE-89",
        vector,
        "4xx untuk AST ilegal / 200 dengan hasil ter-bind — nilai selalu push_bind",
        observed,
        passed,
        Severity.CRITICAL if not passed else Severity.MEDIUM,
    )


def audit_export_sanitization(
    exported: bytes, payload_cells: Sequence[tuple[str, str]]
) -> SecurityFinding:
    """Export wajib mensanitasi sel berawalan `= + - @ \\t \\r` (prefix `'`)."""
    import openpyxl

    workbook = openpyxl.load_workbook(io.BytesIO(exported), data_only=False)
    sheet = workbook.worksheets[0]
    dangerous: list[str] = []
    for row in sheet.iter_rows(values_only=True):
        for value in row:
            if isinstance(value, str) and value.startswith(DANGEROUS_LEADING_CHARS):
                dangerous.append(value[:40])
    expected = "sel hasil export tidak berawalan karakter formula (CWE-1236)"
    if not dangerous:
        return _finding(
            "SOC-W1-006",
            "API8:2023 / CWE-1236 CSV/Formula Injection",
            "CWE-1236",
            "GET /assets/export setelah import sel `=cmd|'/C calc'!A0`",
            expected,
            "semua sel berbahaya tersanitasi (prefix `'`)",
            True,
            Severity.MEDIUM,
        )
    return _finding(
        "SOC-W1-006",
        "API8:2023 / CWE-1236 CSV/Formula Injection",
        "CWE-1236",
        "GET /assets/export setelah import sel `=cmd|'/C calc'!A0`",
        expected,
        f"sel berbahaya ter-export tanpa sanitasi: {dangerous[:3]}",
        False,
        Severity.HIGH,
    )
