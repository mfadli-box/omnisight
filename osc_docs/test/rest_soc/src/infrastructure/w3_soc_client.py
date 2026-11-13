"""Klien keamanan Wave 3 — PAM authorize/redeem/recording + SIEM ingest.

Fasad di atas `HttpxSecurityClient` (redaksi bukti + RoE), berkomposisi
dengan `W2SecurityClient` untuk POST agent HMAC ber-FAULT INJECTION
(`ts`/`signature`/`omit`/`body_override`) — kanonis signature identik:
``{ts}\\n{METHOD}\\n{path}\\n{sha256_hex(body)}`` (api-w2 §2.1, dipakai ulang
api-w3 untuk redeem ticket, upload rekaman, dan ingest SecOps).

Catatan kanonis upload rekaman: signature dihitung atas PATH TANPA QUERY
(``{path}`` pada spesifikasi); query `?format=…` dikirim pada target.
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, Mapping

from domain.findings import AuditEvidence
from infrastructure.security_client import HttpxSecurityClient
from infrastructure.w2_soc_client import (
    AGENT_ID_HEADER,
    AGENT_SIG_HEADER,
    AGENT_TS_HEADER,
    W2SecurityClient,
    error_code,
    json_body,
    sign_agent_request,
)

CORRELATION_HEADER = "X-Correlation-ID"

PAM_AUTHORIZE = "/api/v1/pam/sessions/authorize"
PAM_SESSIONS = "/api/v1/pam/sessions"
TICKET_REDEEM = "/api/v1/agents/pam/ticket/redeem"
SECOPS_INGEST = "/api/v1/agents/security/ingest"
SECOPS_OVERVIEW = "/api/v1/secops/overview"


def pam_recording_path(session_id: str, *, query: str = "format=CAST_GZ") -> str:
    """Path upload rekaman (+query format)."""
    target = f"/api/v1/pam/sessions/{session_id}/recording"
    return f"{target}?{query}" if query else target


class W3SecurityClient:
    """Fasad tipis: JWT JSON + agent HMAC (fault injection) + body biner."""

    def __init__(self, inner: HttpxSecurityClient) -> None:
        self._inner = inner
        self._w2 = W2SecurityClient(inner)

    @property
    def roe(self) -> int:
        return self._inner.config.max_requests_per_test

    # -- JWT ------------------------------------------------------------------
    @staticmethod
    def _jwt_headers(token: str | None, extra: Mapping[str, str] | None = None) -> dict[str, str]:
        headers = {CORRELATION_HEADER: str(uuid.uuid4())}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if extra:
            headers.update(extra)
        return headers

    def get_json(self, path: str, *, token: str | None = None) -> AuditEvidence:
        return self._inner.send("GET", path, headers=self._jwt_headers(token))

    def post_json(
        self,
        path: str,
        payload: Mapping[str, Any],
        *,
        token: str | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> AuditEvidence:
        headers = self._jwt_headers(token, extra_headers)
        headers["Content-Type"] = "application/json"
        return self._inner.send("POST", path, headers=headers, content=json.dumps(payload).encode())

    # -- PAM authorize (JWT, opsi X-Forwarded-For untuk CIDR ACL) --------------
    def authorize_session(
        self,
        payload: Mapping[str, Any],
        *,
        token: str,
        xff: str | None = None,
    ) -> AuditEvidence:
        extra = {"X-Forwarded-For": xff} if xff else None
        return self.post_json(PAM_AUTHORIZE, payload, token=token, extra_headers=extra)

    # -- Agent HMAC (redeem ticket / ingest SIEM) dengan fault injection -------
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
        - ``signature``: signature palsu (secret salah, garbage, cross-endpoint).
        - ``omit``: header HMAC dihilangkan (missing-header vectors).
        - ``body_override``: body dikirim ≠ body yang di-sign (tampering).
        """
        return self._w2.post_agent(
            path,
            payload,
            agent_id=agent_id,
            secret=secret,
            ts=ts,
            signature=signature,
            omit=omit,
            body_override=body_override,
        )

    # -- Upload rekaman PAM (agent HMAC, body biner terikat sha256) ------------
    def upload_recording(
        self,
        session_id: str,
        body: bytes,
        *,
        agent_id: str,
        secret: str,
        query: str = "format=CAST_GZ",
        ts: int | None = None,
        signature: str | None = None,
        omit: frozenset[str] = frozenset(),
    ) -> AuditEvidence:
        path_only = f"/api/v1/pam/sessions/{session_id}/recording"
        ts_value = ts if ts is not None else int(time.time())
        sig = signature if signature is not None else sign_agent_request(
            secret, ts_value, "POST", path_only, body
        )
        headers = {
            CORRELATION_HEADER: str(uuid.uuid4()),
            "Content-Type": "application/octet-stream",
            AGENT_ID_HEADER: agent_id,
            AGENT_TS_HEADER: str(ts_value),
            AGENT_SIG_HEADER: sig,
        }
        for header in omit:
            headers.pop(header, None)
        return self._inner.send(
            "POST", pam_recording_path(session_id, query=query), headers=headers, content=body
        )


__all__ = [
    "W3SecurityClient",
    "PAM_AUTHORIZE",
    "PAM_SESSIONS",
    "TICKET_REDEEM",
    "SECOPS_INGEST",
    "SECOPS_OVERVIEW",
    "pam_recording_path",
    "json_body",
    "data_of",
    "error_code",
    "sign_agent_request",
]


def data_of(evidence: AuditEvidence) -> dict[str, Any]:
    """Envelope `data` — delegasi pola W2 (AssertionError bila tanpa data)."""
    from infrastructure.w2_soc_client import data_of as _data_of

    return _data_of(evidence)
