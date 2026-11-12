"""QA-UNIT: use case verifikasi kontrak health — tanpa jaringan (fake client)."""

from __future__ import annotations

import pytest

from application.health_contract import evaluate_health_snapshot, verify_health_contract
from domain.models import ApiResponseSnapshot

pytestmark = pytest.mark.unit


def snapshot(status_code: int, payload: object | None) -> ApiResponseSnapshot:
    return ApiResponseSnapshot(
        status_code=status_code,
        headers={},
        content_type="application/json" if payload is not None else "text/plain",
        body_text="",
        body_json=payload,
        elapsed_ms=1.0,
        captured_at="2026-11-11T00:00:00+00:00",
    )


class FakeApiClient:
    """Stub ``domain.ApiClient`` — tanpa I/O, catat path yang diminta."""

    def __init__(self, response: ApiResponseSnapshot) -> None:
        self._response = response
        self.requested_paths: list[str] = []

    def get(self, path: str) -> ApiResponseSnapshot:
        self.requested_paths.append(path)
        return self._response


def test_qa_contract_ok_200_passes():
    verdict = evaluate_health_snapshot(
        snapshot(200, {"status": "ok", "checks": {"database": "up", "storage": "up"}})
    )
    assert verdict.passed
    assert verdict.status_code == 200


def test_qa_contract_degraded_503_passes():
    verdict = evaluate_health_snapshot(
        snapshot(503, {"status": "degraded", "checks": {"database": "up", "storage": "down"}})
    )
    assert verdict.passed


def test_qa_contract_rejects_http_status_mismatch():
    verdict = evaluate_health_snapshot(
        snapshot(200, {"status": "degraded", "checks": {"database": "up", "storage": "down"}})
    )
    assert not verdict.passed
    assert "tidak konsisten" in verdict.detail


def test_qa_contract_rejects_unknown_health_status():
    verdict = evaluate_health_snapshot(
        snapshot(200, {"status": "bogus", "checks": {"database": "up", "storage": "up"}})
    )
    assert not verdict.passed


def test_qa_contract_rejects_missing_checks():
    verdict = evaluate_health_snapshot(snapshot(200, {"status": "ok"}))
    assert not verdict.passed


def test_qa_contract_rejects_bad_check_value():
    verdict = evaluate_health_snapshot(
        snapshot(200, {"status": "ok", "checks": {"database": "maybe", "storage": "up"}})
    )
    assert not verdict.passed


def test_qa_contract_rejects_non_json_body():
    verdict = evaluate_health_snapshot(snapshot(200, None))
    assert not verdict.passed
    assert "bukan JSON" in verdict.detail


def test_qa_contract_rejects_unexpected_http_code():
    verdict = evaluate_health_snapshot(snapshot(500, {"status": "ok", "checks": {}}))
    assert not verdict.passed


def test_qa_contract_tolerates_future_extra_fields():
    verdict = evaluate_health_snapshot(
        snapshot(
            200,
            {"status": "ok", "checks": {"database": "up", "storage": "up"}, "uptime": 42},
        )
    )
    assert verdict.passed  # extra="allow" — siap untuk checks baru


def test_qa_verify_health_contract_uses_contract_path():
    client = FakeApiClient(
        snapshot(200, {"status": "ok", "checks": {"database": "up", "storage": "up"}})
    )
    verdict = verify_health_contract(client)
    assert client.requested_paths == ["/api/v1/health"]
    assert verdict.passed
