"""Port Wave 1 milik domain/ — diimplementasikan infrastructure/."""

from __future__ import annotations

from typing import Mapping, Protocol, runtime_checkable

from domain.models import ApiResponseSnapshot
from domain.models_w1 import HrisStubMode


@runtime_checkable
class W1ApiClient(Protocol):
    """Port klien API Wave 1 (JSON envelope + multipart + binary)."""

    def get_json(self, path: str, *, token: str | None = None) -> ApiResponseSnapshot:
        ...

    def post_json(
        self,
        path: str,
        payload: Mapping[str, object],
        *,
        token: str | None = None,
    ) -> ApiResponseSnapshot:
        ...

    def post_multipart(
        self,
        path: str,
        *,
        field: str,
        filename: str,
        content: bytes,
        mime: str,
        token: str | None = None,
    ) -> ApiResponseSnapshot:
        ...

    def get_binary(self, path: str, *, token: str | None = None) -> ApiResponseSnapshot:
        ...


@runtime_checkable
class HrisStubControl(Protocol):
    """Port kontrol stub HRIS ASMX (mode + hitungan panggilan)."""

    @property
    def base_url(self) -> str:
        ...

    def set_mode(self, mode: HrisStubMode) -> None:
        ...

    def hit_count(self) -> int:
        ...
