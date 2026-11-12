"""Port (interface) milik domain/ — diimplementasikan infrastructure/."""

from __future__ import annotations

from typing import Mapping, Protocol, runtime_checkable

from domain.findings import AuditEvidence


@runtime_checkable
class SecurityClient(Protocol):
    """Port klien keamanan — adapter httpx memenuhi protokol ini."""

    def send(
        self,
        method: str,
        path: str,
        *,
        headers: Mapping[str, str] | None = None,
        content: bytes | None = None,
    ) -> AuditEvidence:
        ...
