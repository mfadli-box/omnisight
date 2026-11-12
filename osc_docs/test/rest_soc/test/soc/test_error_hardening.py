"""SOC-LIVE: per-perilaku error — path tak dikenal & method tidak sesuai.

Verifikasi deterministik tanpa bypass: path asing tidak pernah 200, method
PUT pada endpoint GET-only ditolak 405, dan tidak ada detail internal yang
bocor pada error response (CWE-209).
"""

from __future__ import annotations

import pytest

from application.header_audit import scan_information_leakage

pytestmark = [pytest.mark.soc, pytest.mark.info_leak]


def test_soc_l03_unknown_path_never_200_and_no_internals(require_target):
    evidence = require_target.send("GET", "/api/v1/__soc_probe_nonexistent__")
    assert evidence.status_code != 200
    finding = scan_information_leakage(evidence)
    assert finding.passed, f"detail internal bocor pada 404: {finding.observed}"


def test_soc_l04_health_rejects_wrong_method(require_target):
    evidence = require_target.send("PUT", "/api/v1/health")
    assert evidence.status_code == 405
    finding = scan_information_leakage(evidence)
    assert finding.passed
