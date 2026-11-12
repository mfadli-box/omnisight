"""QA-INT: kontrak live ``GET /api/v1/health`` terhadap osc_rest.

Skip otomatis bila target tidak terjangkau (fixture ``require_target``);
jalankan stack untuk pengujian penuh:
``docker compose up -d osc_base rustfs osc_rest``
"""

from __future__ import annotations

import pytest

from application.health_contract import HEALTH_PATH, evaluate_health_snapshot

pytestmark = [pytest.mark.integration, pytest.mark.contract]


def test_qa_i001_health_matches_contract(require_target):
    snapshot = require_target.get(HEALTH_PATH)
    verdict = evaluate_health_snapshot(snapshot)
    assert verdict.passed, f"kontrak health dilanggar: {verdict.detail}"


def test_qa_i002_health_content_type_json(require_target):
    snapshot = require_target.get(HEALTH_PATH)
    assert snapshot.content_type is not None
    assert snapshot.content_type.startswith("application/json")


def test_qa_i003_health_idempotent_consecutive_calls(require_target):
    first = require_target.get(HEALTH_PATH)
    second = require_target.get(HEALTH_PATH)
    assert first.status_code == second.status_code
    assert first.body_json == second.body_json


def test_qa_i004_unknown_path_never_200(require_target):
    snapshot = require_target.get("/api/v1/__qa_nonexistent__")
    assert snapshot.status_code != 200
    assert "panicked at" not in snapshot.body_text
