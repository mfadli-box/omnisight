"""Error domain QA — tanpa detail transport (detail hanya di adapter)."""

from __future__ import annotations


class DomainError(Exception):
    """Induk error domain QA suite."""


class ContractViolationError(DomainError):
    """Respons target tidak sesuai kontrak osc_docs/rest."""


class UnreachableTargetError(DomainError):
    """Target tidak terjangkau (transport) — test live harus skip, bukan gagal."""
