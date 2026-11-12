"""SOC-LIVE: audit header & kebocoran pada osc_rest yang hidup.

Non-destruktif: hanya request GET deterministik (aturan Rules of
Engagement). Skip otomatis bila target tidak terjangkau.
"""

from __future__ import annotations

import pytest

from application.header_audit import audit_security_headers, scan_information_leakage

pytestmark = [pytest.mark.soc, pytest.mark.headers]

HEALTH_PATH = "/api/v1/health"


def test_soc_l01_security_headers_hardened(require_target):
    evidence = require_target.send("GET", HEALTH_PATH)
    findings = audit_security_headers(evidence)
    failures = [finding for finding in findings if not finding.passed]
    assert not failures, "; ".join(
        f"{finding.finding_id}: {finding.vector} → {finding.observed}"
        for finding in failures
    )


def test_soc_l02_no_information_leakage_on_health(require_target):
    evidence = require_target.send("GET", HEALTH_PATH)
    finding = scan_information_leakage(evidence)
    assert finding.passed, f"tanda internal terdeteksi: {finding.observed}"
