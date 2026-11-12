"""Use case: audit security header & kebocoran informasi internal.

Kontrol diekspektasikan dari ``osc_docs/rest/api-core-foundation.md`` §5
(middleware ``security_headers.rs``):
``nosniff``, ``X-Frame-Options: DENY``, ``Referrer-Policy: no-referrer``,
``Content-Security-Policy: default-src 'none'`` (API-only), dan
``Cache-Control: no-store``.
"""

from __future__ import annotations

from typing import Mapping

from domain.findings import AuditEvidence, SecurityFinding, Severity

#: Header wajib → nilai yang diekspektasikan (perbandingan case-insensitive).
REQUIRED_HEADERS: Mapping[str, str] = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "deny",
    "referrer-policy": "no-referrer",
    "cache-control": "no-store",
}

#: Substring CSP yang wajib ada (API-only — tanpa default-src ekstensif).
CSP_SUBSTRING = "default-src 'none'"

#: Tanda detail internal yang TIDAK BOLEH muncul di body respons.
LEAKAGE_SIGNATURES: tuple[str, ...] = (
    "panicked at",
    "backtrace",
    ".rs:",
    "sqlx",
    "postgres://",
    "rustfs",
    "select * from",
    "stack trace",
)

_CSP_HEADER = "content-security-policy"


def audit_security_headers(evidence: AuditEvidence) -> list[SecurityFinding]:
    """Audit header respons satu evidence → daftar temuan per kontrol."""
    headers = {key.lower(): value for key, value in evidence.response_headers.items()}
    findings: list[SecurityFinding] = []

    for index, (name, expected_value) in enumerate(REQUIRED_HEADERS.items(), start=1):
        observed_value = headers.get(name)
        passed = observed_value is not None and observed_value.lower() == expected_value
        findings.append(
            SecurityFinding(
                finding_id=f"SOC-H{index:02d}",
                owasp_category="API7:2023 Security Misconfiguration",
                cwe="CWE-693",
                vector=(
                    f"Inspeksi header {name} pada "
                    f"{evidence.request_method} {evidence.request_path}"
                ),
                expected_defense=f"{name}: {expected_value}",
                observed=observed_value if observed_value is not None else "<tidak ada>",
                severity=Severity.MEDIUM,
                passed=passed,
            )
        )

    csp = headers.get(_CSP_HEADER)
    findings.append(
        SecurityFinding(
            finding_id="SOC-H05",
            owasp_category="API7:2023 Security Misconfiguration",
            cwe="CWE-1021",
            vector=(
                f"Inspeksi CSP pada {evidence.request_method} "
                f"{evidence.request_path}"
            ),
            expected_defense=f"{_CSP_HEADER} memuat \"{CSP_SUBSTRING}\"",
            observed=csp if csp is not None else "<tidak ada>",
            severity=Severity.MEDIUM,
            passed=csp is not None and CSP_SUBSTRING in csp.lower(),
        )
    )
    return findings


def scan_information_leakage(evidence: AuditEvidence) -> SecurityFinding:
    """Pindai body evidence terhadap tanda detail internal (CWE-209)."""
    body = evidence.body_excerpt.lower()
    leaked = [signature for signature in LEAKAGE_SIGNATURES if signature in body]
    return SecurityFinding(
        finding_id="SOC-L01",
        owasp_category="API8:2023 Security Misconfiguration (detail error)",
        cwe="CWE-209",
        vector=(
            f"Pemindaian tanda internal pada body "
            f"{evidence.request_method} {evidence.request_path}"
        ),
        expected_defense="body respons tidak memuat tanda internal "
        "(stack trace, SQL, kredensial, nama bucket)",
        observed=("tanda terdeteksi: " + ", ".join(leaked)) if leaked else "bersih",
        severity=Severity.HIGH if leaked else Severity.INFO,
        passed=not leaked,
    )
