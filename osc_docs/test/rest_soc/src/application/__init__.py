"""application/ — orkestrasi use case keamanan SOC.

ATURAN: hanya bergantung pada domain/ (interface + model murni); generator
vektor serangan di sini adalah DATA murni — pengiriman dilakukan test/
lewat infrastructure.
"""

from application.exploit_vectors import (
    EXCEL_FORMULA_PAYLOADS,
    NON_ZIP_MAGICS,
    PATH_TRAVERSAL_PROBES,
    SQL_INJECTION_PROBES,
    AttackVector,
    alg_none_jwt,
    oversized_payload,
)
from application.header_audit import (
    CSP_SUBSTRING,
    LEAKAGE_SIGNATURES,
    REQUIRED_HEADERS,
    audit_security_headers,
    scan_information_leakage,
)

__all__ = [
    "AttackVector",
    "CSP_SUBSTRING",
    "EXCEL_FORMULA_PAYLOADS",
    "LEAKAGE_SIGNATURES",
    "NON_ZIP_MAGICS",
    "PATH_TRAVERSAL_PROBES",
    "REQUIRED_HEADERS",
    "SQL_INJECTION_PROBES",
    "alg_none_jwt",
    "audit_security_headers",
    "oversized_payload",
    "scan_information_leakage",
]
