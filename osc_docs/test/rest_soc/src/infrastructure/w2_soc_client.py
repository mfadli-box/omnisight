"""Klien keamanan Wave 2 — JWT JSON + agent HMAC dengan INJEKSI CACAT (fault injection).

Wrapper di atas `HttpxSecurityClient` (redaksi bukti + RoE). Parameter
``ts``/``signature``/``omit`` sengaja disediakan agar vektor replay/forgery
bisa dikirim persis seperti dirancang — tanpa logika asersi di sini.
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, Mapping

from application.hmac_agent import agent_signature  # re-export untuk vektor
from domain.findings import AuditEvidence
from infrastructure.security_client import HttpxSecurityClient

CORRELATION_HEADER = "X-Correlation-ID"
AGENT_ID_HEADER = "X-Agent-Id"
AGENT_TS_HEADER = "X-Agent-Timestamp"
AGENT_SIG_HEADER = "X-Agent-Signature"

AGENT_HEADERS = frozenset(
    {AGENT_ID_HEADER, AGENT_TS_HEADER, AGENT_SIG_HEADER}
)


def sign_agent_request(secret_hex: str, ts: int, method: str, path: str, body: bytes) -> str:
    """Kanonis signature api-w2 §2.1 (dipakai vektor & pengiriman sah)."""
    return agent_signature(secret_hex, ts, method, path, body)


class W2SecurityClient:
    """Fasad tipis: JSON JWT + POST agent HMAC ter-kontrol."""

    def __init__(self, inner: HttpxSecurityClient) -> None:
        self._inner = inner

    @property
    def roe(self) -> int:
        return self._inner.config.max_requests_per_test

    # -- JWT (CRUD infra / dispatch) -------------------------------------------
    def get_json(self, path: str, *, token: str | None = None) -> AuditEvidence:
        return self._inner.send("GET", path, headers=self._headers(token))

    def post_json(
        self, path: str, payload: Mapping[str, Any], *, token: str | None = None
    ) -> AuditEvidence:
        return self._inner.send(
            "POST",
            path,
            headers={**self._headers(token), "Content-Type": "application/json"},
            content=json.dumps(payload).encode(),
        )

    def put_json(
        self, path: str, payload: Mapping[str, Any], *, token: str | None = None
    ) -> AuditEvidence:
        return self._inner.send(
            "PUT",
            path,
            headers={**self._headers(token), "Content-Type": "application/json"},
            content=json.dumps(payload).encode(),
        )

    def delete_json(self, path: str, *, token: str | None = None) -> AuditEvidence:
        return self._inner.send("DELETE", path, headers=self._headers(token))

    # -- agent HMAC dengan fault injection -------------------------------------
    def post_agent(
        self,
        path: str,
        payload: Mapping[str, Any],
        *,
        agent_id: str,
        secret: str,
        ts: int | None = None,
        signature: str | None = None,
        omit: frozenset[str] = frozenset(),
        body_override: bytes | None = None,
    ) -> AuditEvidence:
        """POST ter-sign HMAC; setiap parameter adalah titik serangan.

        - ``ts``: replay stale/future di luar window ±30 s.
        - ``signature``: signature palsu (secret salah, cross-endpoint).
        - ``omit``: header dihilangkan (missing-header vectors).
        - ``body_override``: body dikirim ≠ body yang di-sign (tampering).
        """
        body = json.dumps(payload).encode()
        ts_value = ts if ts is not None else int(time.time())
        sig = signature if signature is not None else sign_agent_request(
            secret, ts_value, "POST", path, body
        )
        headers = {
            **self._headers(None),
            "Content-Type": "application/json",
            AGENT_ID_HEADER: agent_id,
            AGENT_TS_HEADER: str(ts_value),
            AGENT_SIG_HEADER: sig,
        }
        for header in omit:
            headers.pop(header, None)
        return self._inner.send(
            "POST", path, headers=headers, content=body_override or body
        )

    @staticmethod
    def _headers(token: str | None) -> dict[str, str]:
        headers = {CORRELATION_HEADER: str(uuid.uuid4())}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers


def json_body(evidence: AuditEvidence) -> dict[str, Any] | None:
    try:
        parsed = json.loads(evidence.body_excerpt)
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def data_of(evidence: AuditEvidence) -> dict[str, Any]:
    body = json_body(evidence)
    if body and isinstance(body.get("data"), dict):
        return body["data"]
    raise AssertionError(f"envelope tanpa data: {evidence.body_excerpt[:160]!r}")


def error_code(evidence: AuditEvidence) -> str | None:
    body = json_body(evidence)
    if not body:
        return None
    error = body.get("error")
    return error.get("code") if isinstance(error, dict) else None
