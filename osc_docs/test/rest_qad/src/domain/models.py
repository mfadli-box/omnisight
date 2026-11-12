"""Model domain murni untuk QA & Debugger suite (zero I/O)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Mapping


class EndpointMethod(str, Enum):
    """Method HTTP yang dikenal kontrak osc_rest."""

    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"


@dataclass(frozen=True)
class ApiEndpoint:
    """Satu endpoint target (method + path) — input orkestrasi test."""

    method: EndpointMethod
    path: str


@dataclass(frozen=True)
class TestCaseScenario:
    """Skenario test ternormalisasi (ID mengikuti matriks di docs)."""

    scenario_id: str  # contoh: "QA-001"
    title: str
    category: str  # "contract" | "boundary" | "excel" | ...
    expected_status: tuple[int, ...]  # status HTTP yang diharapkan


@dataclass(frozen=True)
class ApiResponseSnapshot:
    """Snapshot respons API untuk verifikasi & bukti (evidence ringkas)."""

    status_code: int
    headers: Mapping[str, str]  # sudah lowercase (httpx); tanpa secret request
    content_type: str | None
    body_text: str  # dibatasi panjangnya oleh adapter (anti memory bloat)
    body_json: Any | None  # hasil parse JSON bila content-type json
    body_bytes: bytes | None = None  # payload mentah (binary export/upload)
    elapsed_ms: float = 0.0
    captured_at: str = ""  # ISO-8601 UTC


@dataclass(frozen=True)
class HealthSnapshot:
    """Pemetaan domain kontrak GET /api/v1/health."""

    status: str  # "ok" | "degraded"
    database: str  # "up" | "down"
    storage: str  # "up" | "down"
