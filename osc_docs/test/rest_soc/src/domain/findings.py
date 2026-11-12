"""Model temuan keamanan & bukti audit — pure, zero I/O."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Mapping


class Severity(str, Enum):
    """Tingkat keparahan temuan (diselaraskan dengan praktik CVSS kualitatif)."""

    INFO = "INFO"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


@dataclass(frozen=True)
class AuditEvidence:
    """Snapshot request/response ter-redaksi (lampiran laporan audit).

    Header sensitif (authorization/cookie) DIREDAKSI oleh adapter
    infrastructure sebelum objek ini dibuat — bukti aman untuk disimpan.
    """

    request_method: str
    request_path: str
    request_headers: Mapping[str, str]
    status_code: int
    response_headers: Mapping[str, str]
    body_excerpt: str  # dibatasi panjangnya oleh adapter
    elapsed_ms: float
    captured_at: str  # ISO-8601 UTC


@dataclass(frozen=True)
class SecurityFinding:
    """Satu hasil pemeriksaan kontrol keamanan.

    ``passed=True`` berarti kontrol terbukti bekerja (bukan temuan celah);
    ``passed=False`` berarti kontrol gagal → wajib ada rekomendasi remedi.
    """

    finding_id: str  # contoh: "SOC-H01"
    owasp_category: str  # contoh: "API7:2023 Security Misconfiguration"
    cwe: str  # contoh: "CWE-693"
    vector: str  # serangan/pemeriksaan yang dilakukan
    expected_defense: str
    observed: str
    severity: Severity
    passed: bool
