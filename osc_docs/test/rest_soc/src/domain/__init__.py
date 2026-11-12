"""domain/ — layer terdalam SOC suite.

ATURAN: ZERO import httpx, pytest, atau modul OS — model temuan keamanan,
severity, bukti audit, dan port klien murni (stdlib + typing saja).
"""

from domain.errors import DomainError, UnreachableTargetError
from domain.findings import AuditEvidence, SecurityFinding, Severity
from domain.gateways import SecurityClient

__all__ = [
    "AuditEvidence",
    "DomainError",
    "SecurityClient",
    "SecurityFinding",
    "Severity",
    "UnreachableTargetError",
]
