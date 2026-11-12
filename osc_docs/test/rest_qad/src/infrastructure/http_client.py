"""Adapter httpx — implementasi port ``domain.ApiClient``.

Karakter:
- ``follow_redirects=False`` — kontrak strict; redirect dianggap penyimpangan.
- ``trust_env=False`` — trafik test tidak mengikuti proxy lingkungan.
- Snapshot evidence dibatasi (anti memory bloat).
- Error transport dibungkus ``UnreachableTargetError`` (domain) agar test
  live bisa ``skip`` deterministik alih-alih gagal.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import TracebackType
from typing import Any

import httpx

from domain.errors import UnreachableTargetError
from domain.models import ApiResponseSnapshot
from infrastructure.config import TargetConfig

MAX_BODY_CHARS = 65_536  # batas snapshot body (evidence ringkas)
USER_AGENT = "omnisight-qa/0.1.0"


class HttpxApiClient:
    """Klien sinkron per-suite (scope session pada conftest)."""

    def __init__(self, config: TargetConfig) -> None:
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        if config.token:
            headers["Authorization"] = f"Bearer {config.token}"
        self._client = httpx.Client(
            base_url=str(config.base_url).rstrip("/"),
            timeout=config.timeout_seconds,
            follow_redirects=False,
            headers=headers,
            trust_env=False,
        )

    def get(self, path: str) -> ApiResponseSnapshot:
        try:
            response = self._client.get(path)
        except httpx.TransportError as exc:
            raise UnreachableTargetError(f"target tidak terjangkau: {exc}") from exc
        return snapshot_from_httpx_response(response)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "HttpxApiClient":
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.close()


def snapshot_from_httpx_response(response: httpx.Response) -> ApiResponseSnapshot:
    """Bingkai ``httpx.Response`` menjadi snapshot domain (evidence ringkas)."""
    content_type = response.headers.get("content-type")
    body_json: Any | None = None
    if content_type and content_type.split(";")[0].strip() == "application/json":
        try:
            body_json = response.json()
        except ValueError:
            body_json = None  # content-type json tetapi body rusak
    try:
        body_text = response.text[:MAX_BODY_CHARS]
    except UnicodeDecodeError:  # payload biner tanpa charset — tetap aman
        body_text = ""
    return ApiResponseSnapshot(
        status_code=response.status_code,
        headers=dict(response.headers),
        content_type=content_type,
        body_text=body_text,
        body_bytes=response.content[:MAX_BODY_CHARS],
        body_json=body_json,
        elapsed_ms=response.elapsed.total_seconds() * 1000.0,
        captured_at=datetime.now(timezone.utc).isoformat(),
    )
