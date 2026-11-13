"""Adapter httpx Wave 2 — implementasi port ``domain.gateways_w2.W2ApiClient``.

- JWT CRUD: pola ``W1HttpxClient`` (follow_redirects=False, trust_env=False,
  `X-Correlation-ID` per request).
- Agent HMAC: headers `X-Agent-Id` / `X-Agent-Timestamp` / `X-Agent-Signature`
  dihitung via ``application.hmac_agent`` (kanonis api-w2 §2.1).
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Mapping

import httpx

from application.hmac_agent import agent_signature
from domain.errors import UnreachableTargetError
from domain.gateways_w2 import W2ApiClient  # noqa: F401  (dokumentasi port)
from domain.models import ApiResponseSnapshot
from infrastructure.config import TargetConfig
from infrastructure.http_client import snapshot_from_httpx_response

CORRELATION_HEADER = "X-Correlation-ID"


class W2HttpxClient:
    """Klien sinkron Wave 2 (token per-call → aman multi-akun)."""

    def __init__(self, config: TargetConfig) -> None:
        self._client = httpx.Client(
            base_url=str(config.base_url).rstrip("/"),
            timeout=config.timeout_seconds,
            follow_redirects=False,
            headers={
                "User-Agent": "omnisight-qa-w2/0.1.0",
                "Accept": "application/json",
            },
            trust_env=False,
        )

    # -- port W2ApiClient (JWT) ----------------------------------------------
    def get_json(self, path: str, *, token: str | None = None) -> ApiResponseSnapshot:
        return self._request("GET", path, token=token)

    def post_json(
        self, path: str, payload: Mapping[str, Any], *, token: str | None = None
    ) -> ApiResponseSnapshot:
        return self._request("POST", path, token=token, content=json.dumps(payload).encode())

    def put_json(
        self, path: str, payload: Mapping[str, Any], *, token: str | None = None
    ) -> ApiResponseSnapshot:
        return self._request("PUT", path, token=token, content=json.dumps(payload).encode())

    def delete_json(self, path: str, *, token: str | None = None) -> ApiResponseSnapshot:
        return self._request("DELETE", path, token=token)

    # -- agent HMAC (§2.1) -----------------------------------------------------
    def post_agent_signed(
        self,
        path: str,
        payload: Mapping[str, Any],
        *,
        agent_id: str,
        secret: str,
        ts: int | None = None,
        signature: str | None = None,
        omit: frozenset[str] = frozenset(),
    ) -> ApiResponseSnapshot:
        """POST ter-sign HMAC; `ts`/`signature`/`omit` untuk kasus khusus QA."""
        body = json.dumps(payload).encode()
        ts_value = ts if ts is not None else int(__import__("time").time())
        sig = signature if signature is not None else agent_signature(
            secret, ts_value, "POST", path, body
        )
        headers = {
            CORRELATION_HEADER: str(uuid.uuid4()),
            "Content-Type": "application/json",
            "X-Agent-Id": agent_id,
            "X-Agent-Timestamp": str(ts_value),
            "X-Agent-Signature": sig,
        }
        for header in omit:
            headers.pop(header, None)
        return self._raw("POST", path, headers=headers, content=body)

    # -- internal --------------------------------------------------------------
    def _request(
        self,
        method: str,
        path: str,
        *,
        token: str | None = None,
        content: bytes | None = None,
    ) -> ApiResponseSnapshot:
        headers = {
            CORRELATION_HEADER: str(uuid.uuid4()),
            "Content-Type": "application/json",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return self._raw(method, path, headers=headers, content=content)

    def _raw(
        self,
        method: str,
        path: str,
        *,
        headers: dict[str, str],
        content: bytes | None = None,
    ) -> ApiResponseSnapshot:
        try:
            response = self._client.request(
                method, path, headers=headers, content=content
            )
        except httpx.TransportError as exc:
            raise UnreachableTargetError(f"target tidak terjangkau: {exc}") from exc
        return snapshot_from_httpx_response(response)

    def close(self) -> None:
        self._client.close()


def data_of(snapshot: ApiResponseSnapshot) -> dict[str, Any]:
    """Ekstrak `data` envelope (layer test, bukan keputusan bisnis)."""
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
