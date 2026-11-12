"""Klien keamanan httpx — implementasi port ``domain.SecurityClient``.

Karakter:
- ``follow_redirects=False`` — redirect bisa menutupi perilaku nyata.
- ``trust_env=False`` — trafik audit tidak mengikuti proxy lingkungan.
- Metode HTTP di-whitelist; jumlah request dibatasi Rules of Engagement.
- Bukti audit ter-redaksi (authorization/cookie → ``<redacted>``).
- Error transport dibungkus ``UnreachableTargetError`` agar test live
  ``skip`` deterministik, bukan gagal.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import TracebackType
from typing import Mapping

import httpx

from domain.errors import UnreachableTargetError
from domain.findings import AuditEvidence
from infrastructure.config import SocTargetConfig
from infrastructure.evidence import redact_headers

USER_AGENT = "omnisight-soc-audit/0.1.0"
MAX_BODY_CHARS = 65_536
ALLOWED_METHODS = frozenset(
    {"GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"}
)


class HttpxSecurityClient:
    """Klien sinkron per-suite (scope session pada conftest)."""

    def __init__(self, config: SocTargetConfig) -> None:
        self._config = config
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

    @property
    def config(self) -> SocTargetConfig:
        return self._config

    def send(
        self,
        method: str,
        path: str,
        *,
        headers: Mapping[str, str] | None = None,
        content: bytes | None = None,
    ) -> AuditEvidence:
        method = method.upper()
        if method not in ALLOWED_METHODS:
            raise ValueError(f"metode tidak diizinkan: {method}")
        request_headers = dict(headers) if headers else {}
        try:
            response = self._client.request(
                method, path, headers=request_headers, content=content
            )
        except httpx.TransportError as exc:
            raise UnreachableTargetError(f"target tidak terjangkau: {exc}") from exc
        return evidence_from_httpx_response(method, path, request_headers, response)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "HttpxSecurityClient":
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.close()


def evidence_from_httpx_response(
    method: str,
    path: str,
    request_headers: Mapping[str, str],
    response: httpx.Response,
) -> AuditEvidence:
    """Bingkai interaksi menjadi bukti audit ter-redaksi (evidence ringkas)."""
    return AuditEvidence(
        request_method=method,
        request_path=path,
        request_headers=redact_headers(request_headers),
        status_code=response.status_code,
        response_headers=dict(response.headers),
        body_excerpt=response.text[:MAX_BODY_CHARS],
        elapsed_ms=response.elapsed.total_seconds() * 1000.0,
        captured_at=datetime.now(timezone.utc).isoformat(),
    )
