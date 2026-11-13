"""Port klien API Wave 2 — abstraksi infrastruktur (typing.Protocol)."""

from __future__ import annotations

from typing import Any, Mapping, Protocol

from domain.models import ApiResponseSnapshot


class W2ApiClient(Protocol):
    """Kontrak minimal klien Wave 2 (JWT CRUD + agent HMAC signed)."""

    def get_json(self, path: str, *, token: str | None = None) -> ApiResponseSnapshot: ...

    def post_json(
        self, path: str, payload: Mapping[str, Any], *, token: str | None = None
    ) -> ApiResponseSnapshot: ...

    def put_json(
        self, path: str, payload: Mapping[str, Any], *, token: str | None = None
    ) -> ApiResponseSnapshot: ...

    def delete_json(self, path: str, *, token: str | None = None) -> ApiResponseSnapshot: ...

    def post_agent_signed(
        self,
        path: str,
        payload: Mapping[str, Any],
        *,
        agent_id: str,
        secret: str,
    ) -> ApiResponseSnapshot: ...
