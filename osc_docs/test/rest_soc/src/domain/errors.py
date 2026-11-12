"""Error domain SOC — tanpa detail transport (detail hanya di adapter)."""

from __future__ import annotations


class DomainError(Exception):
    """Induk error domain SOC suite."""


class UnreachableTargetError(DomainError):
    """Target tidak terjangkau — test live harus skip, bukan gagal."""
