"""Klien keamanan Wave 1 — wrapper JSON/multipart/binary di atas port SOC.

Menggunakan `HttpxSecurityClient` (redaksi bukti + RoE). Tidak ada logika
keputusan di sini — semua asersi di application/.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Mapping

from domain.findings import AuditEvidence
from infrastructure.security_client import HttpxSecurityClient

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
CORRELATION_HEADER = "X-Correlation-ID"


class W1SecurityClient:
    """Fasad tipis: JSON envelope, multipart Excel, binary export."""

    def __init__(self, inner: HttpxSecurityClient) -> None:
        self._inner = inner

    @property
    def roe(self) -> int:
        return self._inner.config.max_requests_per_test

    def get_json(self, path: str, *, token: str | None = None) -> AuditEvidence:
        return self._inner.send("GET", path, headers=self._headers(token))

    def post_json(
        self,
        path: str,
        payload: Mapping[str, Any],
        *,
        token: str | None = None,
    ) -> AuditEvidence:
        return self._inner.send(
            "POST",
            path,
            headers={**self._headers(token), "Content-Type": "application/json"},
            content=json.dumps(payload).encode(),
        )

    def upload_multipart(
        self,
        path: str,
        *,
        field: str,
        filename: str,
        content: bytes,
        mime: str = XLSX_MIME,
        token: str | None = None,
    ) -> AuditEvidence:
        # httpx multipart butuh stream objek — bangun body multipart manual
        # agar tetap lewat port `send()` (bukti ter-redaksi konsisten).
        boundary = f"----omnisightsoc{uuid.uuid4().hex}"
        parts = [
            (
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; "
                f"filename=\"{filename}\"\r\nContent-Type: {mime}\r\n\r\n"
            ).encode() + content + b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
        body = b"".join(parts)
        return self._inner.send(
            "POST",
            path,
            headers={
                **self._headers(token),
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
            content=body,
        )

    def download(self, path: str, *, token: str | None = None) -> AuditEvidence:
        return self.get_json(path, token=token)  # body_excerpt memuat bytes ter-redaksi

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
