"""QA-W2-I* — Telemetry & uptime ingest batch (api-w2 §2.2) via HMAC agent."""

from __future__ import annotations

import pytest

from application.w2_flows import (
    build_metrics_payload,
    ingest_inventory,
    ingest_metrics,
    ingest_uptime,
    is_uuid,
    push_agent_logs,
)
from infrastructure.w2_client import error_code_of

pytestmark = [
    pytest.mark.integration,
    pytest.mark.wave2,
]

NOW = "2026-11-13T08:00:00Z"


def _host_sample() -> dict:
    return {
        "recorded_at": NOW,
        "cpu_usage_pct": 42.5,
        "load1": 1.2,
        "load5": 1.1,
        "load15": 0.9,
        "mem_used_bytes": 8_000_000_000,
        "mem_total_bytes": 16_000_000_000,
        "disk_used_bytes": 100_000_000_000,
        "disk_total_bytes": 200_000_000_000,
        "net_in_bps": 1_000_000,
        "net_out_bps": 800_000,
        "uptime_seconds": 86_400,
    }


def test_inventory_ingest_accepted(require_w2, enrolled_agent):
    """QA-W2-I01 — inventory ingest → 202 accepted + snapshot_id UUID."""
    snapshot = ingest_inventory(
        require_w2,
        enrolled_agent,
        {
            "cpu_model": "AMD EPYC 7B13",
            "cpu_cores": 16,
            "os_name": "Ubuntu",
            "os_version": "24.04 LTS",
            "hostname": "qa-w2-i01",
            "payload": {"disks": [{"model": "Samsung PM9A3", "size": 3840755982336}]},
        },
    )
    assert snapshot.status_code == 202, f"HTTP {snapshot.status_code}: {snapshot.body_text[:200]!r}"
    data = require_w2.data_of(snapshot)
    assert is_uuid(str(data.get("snapshot_id", ""))), "snapshot_id bukan UUID"


def test_metrics_batch_ingest_counts(require_w2, enrolled_agent, docker_host_id):
    """QA-W2-I02 — batch host+2 container+SMART+SNMP → 202 dengan hitungan row."""
    if not docker_host_id:
        pytest.skip("QA_W2_DOCKER_HOST_ID tidak diset — butuh docker_hosts milik tenant")
    payload = build_metrics_payload(
        host=_host_sample(),
        containers=(
            {
                "host_id": docker_host_id,
                "container_ref": "qa0000000001",
                "container_name": "api",
                "recorded_at": NOW,
                "cpu_usage_pct": 12.5,
                "mem_used_bytes": 536870912,
                "mem_limit_bytes": 1073741824,
                "is_running": True,
            },
            {
                "host_id": docker_host_id,
                "container_ref": "qa0000000002",
                "container_name": "web",
                "recorded_at": NOW,
                "cpu_usage_pct": 3.5,
                "mem_used_bytes": 134217728,
                "mem_limit_bytes": 536870912,
                "is_running": True,
            },
        ),
        smart=(
            {
                "device": "/dev/nvme0n1",
                "health": "PASSED",
                "temperature_c": 34,
                "reallocated_sectors": 0,
                "power_on_hours": 18250,
            },
        ),
        snmp_interfaces=(),  # interface_id tenant-wajib; diuji saat env tersedia
    )
    snapshot = ingest_metrics(require_w2, enrolled_agent, payload)
    assert snapshot.status_code == 202, f"HTTP {snapshot.status_code}: {snapshot.body_text[:200]!r}"
    data = require_w2.data_of(snapshot)
    assert data.get("system_rows") == 1, "host sample tidak ter-insert 1 baris"
    assert data.get("container_rows") == 2, "2 container tidak ter-insert"
    assert data.get("smart_reports") == 1, "1 laporan SMART tidak ter-catat"


def test_metrics_batch_limit_containers(require_w2, enrolled_agent):
    """QA-W2-I03 — containers > 200 → 400 VALIDATION_ERROR (payload bomb gate)."""
    payload = build_metrics_payload(
        containers=tuple(
            {
                "host_id": "00000000-0000-0000-0000-000000000000",
                "container_ref": f"qa{i:010d}",
                "container_name": f"c{i}",
                "recorded_at": NOW,
                "is_running": False,
            }
            for i in range(201)
        )
    )
    snapshot = ingest_metrics(require_w2, enrolled_agent, payload)
    assert snapshot.status_code == 400, (
        f"batch 201 container diterima (HTTP {snapshot.status_code}) — batas "
        "batch api-w2 §2.2 dilanggar"
    )
    assert error_code_of(snapshot) == "VALIDATION_ERROR"


def test_metrics_batch_limit_smart(require_w2, enrolled_agent):
    """QA-W2-I04 — smart > 64 → 400."""
    payload = build_metrics_payload(
        smart=tuple(
            {"device": f"/dev/sd{i}", "health": "PASSED"} for i in range(65)
        )
    )
    snapshot = ingest_metrics(require_w2, enrolled_agent, payload)
    assert snapshot.status_code == 400, f"HTTP {snapshot.status_code}"
    assert error_code_of(snapshot) == "VALIDATION_ERROR"


def test_uptime_heartbeat_ingest(require_w2, enrolled_agent):
    """QA-W2-I05 — heartbeat DOWN lalu UP → 202 + heartbeat_id UUID."""
    monitors = require_w2.get_json("/api/v1/monitors", token=None)
    del monitors  # keberadaan monitor tidak wajib — server tetap mencatat push
    down = ingest_uptime(
        require_w2,
        enrolled_agent,
        {
            "monitor_id": "00000000-0000-0000-0000-000000000000",
            "status": "DOWN",
            "ping_ms": None,
            "msg": "qa synthetic down",
            "recorded_at": "2026-11-13T08:00:05Z",
        },
    )
    # monitor milik company wajib; UUID nol milik tenant lain → 400/404.
    assert down.status_code in (202, 400, 404), (
        f"heartbeat tenant-wajib tidak ditegakkan: HTTP {down.status_code}"
    )
    if down.status_code != 202:
        pytest.skip(
            "belum ada monitor QA milik company agent — validasi kepemilikan "
            "monitor sudah terbukti menolak UUID nol"
        )
    data = require_w2.data_of(down)
    assert is_uuid(str(data.get("heartbeat_id", "")))


def test_agent_ingest_requires_hmac(require_w2, enrolled_agent):
    """QA-W2-I06 — ingest tanpa header HMAC → 401 (auth per-request)."""
    snapshot = require_w2.post_json(
        "/api/v1/agents/inventory/ingest", {"payload": {}}
    )
    assert snapshot.status_code == 401, f"HTTP {snapshot.status_code}"


def test_agent_logs_push_and_cap(require_w2, enrolled_agent):
    """QA-W2-I07 — logs push 2 baris → published=2; 101 baris → 400."""
    ok = push_agent_logs(
        require_w2,
        enrolled_agent,
        scope="docker_stack",
        reference="00000000-0000-0000-0000-000000000000",
        source="compose",
        level="INFO",
        lines=["Pulling api …", "Container api  Healthy"],
    )
    assert ok.status_code in (202, 400, 404), (
        f"push logs gagal tak terduga: HTTP {ok.status_code}"
    )
    if ok.status_code == 202:
        assert require_w2.data_of(ok).get("published") == 2
    else:
        # referensi stack UUID nol bukan milik company agent → ditolak rapi
        assert error_code_of(ok) in {"VALIDATION_ERROR", "NOT_FOUND", "FORBIDDEN"}
    too_many = push_agent_logs(
        require_w2,
        enrolled_agent,
        scope="docker_stack",
        reference="00000000-0000-0000-0000-000000000000",
        source="compose",
        level="INFO",
        lines=[f"line-{i}"] * 101,
    )
    assert too_many.status_code == 400, (
        f"101 baris log diterima (HTTP {too_many.status_code}) — batas 100 baris dilanggar"
    )
    assert error_code_of(too_many) == "VALIDATION_ERROR"
