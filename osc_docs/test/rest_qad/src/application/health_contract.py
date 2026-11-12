"""Use case: verifikasi kontrak ``GET /api/v1/health``.

Sumber kontrak: ``osc_docs/rest/api-core-foundation.md`` §2 —
- ``200 OK``  → ``{"status": "ok",       "checks": {database, storage}}``
- ``503``     → ``{"status": "degraded", "checks": {database, storage}}``
Envelope error generik berlaku untuk status lain (400/401/403/413/429/500).
"""

from __future__ import annotations

from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, StrictStr, ValidationError, field_validator

from domain.errors import ContractViolationError
from domain.gateways import ApiClient
from domain.models import ApiResponseSnapshot

HEALTH_PATH = "/api/v1/health"

#: Pemetaan status JSON kontrak → status HTTP kontrak.
EXPECTED_STATUS_CODE_BY_STATUS = {"ok": 200, "degraded": 503}


class HealthResponseModel(BaseModel):
    """Skema respons health (field baru di masa depan diizinkan — extra=allow)."""

    model_config = ConfigDict(extra="allow")

    status: StrictStr
    checks: dict[StrictStr, StrictStr]

    @field_validator("status")
    @classmethod
    def _status_known(cls, value: str) -> str:
        if value not in EXPECTED_STATUS_CODE_BY_STATUS:
            raise ValueError(f"status health tidak dikenal: {value!r}")
        return value

    @field_validator("checks")
    @classmethod
    def _checks_valid(cls, value: dict[str, str]) -> dict[str, str]:
        allowed = {"up", "down"}
        for key, check_status in value.items():
            if check_status not in allowed:
                raise ValueError(f"checks[{key}] tidak valid: {check_status!r}")
        return value


@dataclass(frozen=True)
class ContractVerdict:
    """Hasil evaluasi satu snapshot health terhadap kontrak."""

    passed: bool
    status_code: int
    detail: str


def evaluate_health_snapshot(snapshot: ApiResponseSnapshot) -> ContractVerdict:
    """Verifikasi MURNI (tanpa I/O) satu snapshot health.

    Pemisahan ini memungkinkan unit test penuh dengan data sintetis,
    sementara test live hanya mengambil snapshot lewat port ApiClient.
    """
    if snapshot.status_code not in (200, 503):
        return ContractVerdict(
            False,
            snapshot.status_code,
            f"status HTTP {snapshot.status_code} di luar kontrak (200/503)",
        )
    if snapshot.body_json is None:
        return ContractVerdict(
            False,
            snapshot.status_code,
            f"body bukan JSON (content-type: {snapshot.content_type!r})",
        )
    try:
        model = HealthResponseModel.model_validate(snapshot.body_json)
    except ValidationError as exc:
        return ContractVerdict(
            False,
            snapshot.status_code,
            f"skema respons tidak sesuai: {exc.error_count()} error, "
            f"pertama: {exc.errors()[0]['msg']}",
        )

    expected_code = EXPECTED_STATUS_CODE_BY_STATUS[model.status]
    if snapshot.status_code != expected_code:
        return ContractVerdict(
            False,
            snapshot.status_code,
            "pasangan HTTP/status tidak konsisten: "
            f"HTTP {snapshot.status_code} vs status={model.status!r} "
            f"(harusnya HTTP {expected_code})",
        )
    return ContractVerdict(
        True,
        snapshot.status_code,
        f"kontrak health terpenuhi (HTTP {snapshot.status_code}, "
        f"status={model.status!r})",
    )


def verify_health_contract(client: ApiClient) -> ContractVerdict:
    """Orkestrasi: ambil snapshot dari target lalu evaluasi kontraknya."""
    snapshot = client.get(HEALTH_PATH)
    return evaluate_health_snapshot(snapshot)
