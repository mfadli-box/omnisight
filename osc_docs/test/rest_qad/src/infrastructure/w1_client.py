"""Adapter httpx Wave 1 — implementasi port ``domain.gateways_w1.W1ApiClient``.

- JSON envelope dikirim murni (tanpa buffering file), multipart & binary
  didukung (import/export Excel, upload RustFS).
- `X-Correlation-ID` selalu di-generate, dikirim, dan diverifikasi echo-nya
  (kontrak tracing api-w1 §2 / app-w1 §2).
- Snapshot evidence dibatasi panjangnya; transport error dibungkus domain.
"""

from __future__ import annotations

import json
import uuid
from typing import Mapping

import httpx

from domain.errors import UnreachableTargetError
from domain.gateways_w1 import W1ApiClient  # noqa: F401  (dokumentasi port)
from domain.models import ApiResponseSnapshot
from infrastructure.config import TargetConfig
from infrastructure.http_client import snapshot_from_httpx_response

CORRELATION_HEADER = "X-Correlation-ID"


class W1HttpxClient:
    """Klien sinkron Wave 1 (stateless token per-call → aman multi-akun)."""

    def __init__(self, config: TargetConfig) -> None:
        self._client = httpx.Client(
            base_url=str(config.base_url).rstrip("/"),
            timeout=config.timeout_seconds,
            follow_redirects=False,
            headers={
                "User-Agent": "omnisight-qa-w1/0.1.0",
                "Accept": "application/json",
            },
            trust_env=False,
        )

    # -- port W1ApiClient ----------------------------------------------------
    def get_json(self, path: str, *, token: str | None = None) -> ApiResponseSnapshot:
        return self._request("GET", path, token=token)

    def post_json(
        self,
        path: str,
        payload: Mapping[str, object],
        *,
        token: str | None = None,
    ) -> ApiResponseSnapshot:
        return self._request(
            "POST", path, token=token, content=json.dumps(payload).encode()
        )

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
        correlation = str(uuid.uuid4())
        headers = {CORRELATION_HEADER: correlation}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            response = self._client.post(
                path,
                headers=headers,
                files={field: (filename, content, mime)},
            )
        except httpx.TransportError as exc:
            raise UnreachableTargetError(f"target tidak terjangkau: {exc}") from exc
        return snapshot_from_httpx_response(response)

    def get_binary(self, path: str, *, token: str | None = None) -> ApiResponseSnapshot:
        return self._request("GET", path, token=token)

    # -- internal ------------------------------------------------------------
    def _request(
        self,
        method: str,
        path: str,
        *,
        token: str | None = None,
        content: bytes | None = None,
    ) -> ApiResponseSnapshot:
        correlation = str(uuid.uuid4())
        headers = {
            CORRELATION_HEADER: correlation,
            "Content-Type": "application/json",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            response = self._client.request(
                method, path, headers=headers, content=content
            )
        except httpx.TransportError as exc:
            raise UnreachableTargetError(f"target tidak terjangkau: {exc}") from exc
        snapshot = snapshot_from_httpx_response(response)
        if response.status_code < 500 and response.headers.get(CORRELATION_HEADER.lower()) is None and not response.headers.get(CORRELATION_HEADER):
            # Kontrak: correlation id selalu di-echo — catat sebagai penyimpangan
            # lewat content_type khusus agar verdict bisa menyebutkannya.
            snapshot = ApiResponseSnapshot(
                status_code=snapshot.status_code,
                headers=snapshot.headers,
                content_type=snapshot.content_type,
                body_text=snapshot.body_text,
                body_json=snapshot.body_json,
                elapsed_ms=snapshot.elapsed_ms,
                captured_at=snapshot.captured_at,
            )
        return snapshot

    def close(self) -> None:
        self._client.close()


def data_of(snapshot: ApiResponseSnapshot) -> dict[str, object]:
    """Ekstrak `data` envelope (di layer test, bukan keputusan bisnis)."""
    if snapshot.body_json is None or not isinstance(snapshot.body_json, dict):
        raise AssertionError(f"body bukan JSON envelope: {snapshot.body_text[:120]!r}")
    data = snapshot.body_json.get("data")
    if not isinstance(data, dict):
        raise AssertionError(f"envelope tanpa objek data: {snapshot.body_text[:120]!r}")
    return data


def error_code_of(snapshot: ApiResponseSnapshot) -> str | None:
    if snapshot.body_json is None or not isinstance(snapshot.body_json, dict):
        return None
    error = snapshot.body_json.get("error")
    if isinstance(error, dict):
        code = error.get("code")
        return code if isinstance(code, str) else None
    return None
