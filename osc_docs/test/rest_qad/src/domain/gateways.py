"""Port (interface) milik domain/ — diimplementasikan infrastructure/."""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from domain.models import ApiResponseSnapshot


@runtime_checkable
class ApiClient(Protocol):
    """Port klien API — adapter httpx memenuhi protokol ini."""

    def get(self, path: str) -> ApiResponseSnapshot:
        ...
