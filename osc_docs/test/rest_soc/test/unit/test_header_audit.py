"""SOC-UNIT: use case audit header & kebocoran — tanpa jaringan (synthetic)."""

from __future__ import annotations

import pytest

from application.header_audit import audit_security_headers, scan_information_leakage
from domain.findings import AuditEvidence, Severity

pytestmark = pytest.mark.unit


def evidence(
    status_code: int = 200,
    headers: dict[str, str] | None = None,
    body: str = "",
) -> AuditEvidence:
    return AuditEvidence(
        request_method="GET",
        request_path="/api/v1/health",
        request_headers={},
        status_code=status_code,
        response_headers=headers or {},
        body_excerpt=body,
        elapsed_ms=1.0,
        captured_at="2026-11-11T00:00:00+00:00",
    )


HARDENED_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'",
}


def test_soc_all_header_checks_pass_on_hardened_response():
    findings = audit_security_headers(evidence(headers=HARDENED_HEADERS))
    assert len(findings) == 5  # 4 header wajib + 1 CSP
    assert all(finding.passed for finding in findings)


def test_soc_missing_headers_are_reported_as_medium():
    findings = audit_security_headers(evidence(headers={"Content-Type": "application/json"}))
    failed = [finding for finding in findings if not finding.passed]
    assert len(failed) == 5
    assert all(finding.observed == "<tidak ada>" for finding in failed)
    assert all(finding.severity is Severity.MEDIUM for finding in failed)


def test_soc_wrong_header_value_fails_check():
    headers = dict(HARDENED_HEADERS)
    headers["X-Frame-Options"] = "SAMEORIGIN"
    findings = audit_security_headers(evidence(headers=headers))
    xfo = next(finding for finding in findings if finding.finding_id == "SOC-H02")
    assert not xfo.passed
    assert xfo.observed == "SAMEORIGIN"


def test_soc_csp_without_default_src_none_fails():
    headers = dict(HARDENED_HEADERS)
    headers["Content-Security-Policy"] = "default-src 'self'"
    findings = audit_security_headers(evidence(headers=headers))
    csp = next(finding for finding in findings if finding.finding_id == "SOC-H05")
    assert not csp.passed


def test_soc_leakage_detected_on_stack_trace_body():
    finding = scan_information_leakage(
        evidence(body="panicked at src/main.rs:42: backtrace unavailable")
    )
    assert not finding.passed
    assert finding.severity is Severity.HIGH
    assert "panicked at" in finding.observed


def test_soc_leakage_detected_on_sql_and_bucket_names():
    finding = scan_information_leakage(
        evidence(body='{"error":"sqlx: SELECT * FROM users; bucket rustfs-internal"}')
    )
    assert not finding.passed


def test_soc_clean_body_passes_leakage_scan():
    finding = scan_information_leakage(evidence(body='{"status":"ok"}'))
    assert finding.passed
    assert finding.severity is Severity.INFO
