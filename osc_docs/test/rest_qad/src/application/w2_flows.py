"""Use case orkestrasi Wave 2 (api-w2 §2.1–§2.2) — hanya bergantung port domain.

Semua fungsi menerima port ``W2ApiClient``; keputusan ekspektasi tetap di layer
test. Zero httpx/pytest di sini (Clean Architecture).
"""

from __future__ import annotations

import re
import uuid
from typing import Any, Mapping

from domain.gateways_w2 import W2ApiClient
from domain.models import ApiResponseSnapshot
from domain.models_w2 import AgentCredential, EnrollmentToken

API = "/api/v1"
TOKEN_RE = re.compile(r"^[0-9a-f]{64}$")
HEX64_RE = re.compile(r"^[0-9a-fA-F]{64}$")
UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def is_hex64(value: str) -> bool:
    return bool(HEX64_RE.fullmatch(value))


def is_uuid(value: str) -> bool:
    return bool(UUID_RE.fullmatch(value))


# ---------------------------------------------------------------------------
# Enrollment (§2.1)
# ---------------------------------------------------------------------------
def issue_enrollment_token(
    client: W2ApiClient,
    *,
    token: str,
    node_type: str = "HOST",
    ttl_hours: int | None = None,
) -> ApiResponseSnapshot:
    payload: dict[str, Any] = {"node_type": node_type}
    if ttl_hours is not None:
        payload["ttl_hours"] = ttl_hours
    return client.post_json(f"{API}/agents/enrollment-tokens", payload, token=token)


def parsed_token(snapshot: ApiResponseSnapshot) -> EnrollmentToken:
    assert snapshot.body_json is not None, "body bukan JSON"
    data = snapshot.body_json.get("data")
    assert isinstance(data, dict), "envelope tanpa data"
    return EnrollmentToken(
        id=str(data.get("id", "")),
        token=str(data.get("token", "")),
        node_type=str(data.get("node_type", "")),
        expires_at=str(data.get("expires_at", "")),
    )


def enroll_agent(
    client: W2ApiClient,
    *,
    enrollment_token: str,
    hostname: str,
    mgmt_ip: str,
    asset_model_id: str,
    status_label_id: str,
    agent_version: str = "qa-w2/0.1.0",
    asset_tag: str | None = None,
) -> ApiResponseSnapshot:
    payload: dict[str, Any] = {
        "enrollment_token": enrollment_token,
        "hostname": hostname,
        "mgmt_ip": mgmt_ip,
        "asset_model_id": asset_model_id,
        "status_label_id": status_label_id,
        "agent_version": agent_version,
    }
    if asset_tag is not None:
        payload["asset_tag"] = asset_tag
    return client.post_json(f"{API}/agents/enroll", payload)


def credential_of(snapshot: ApiResponseSnapshot) -> AgentCredential:
    assert snapshot.body_json is not None, "body bukan JSON"
    data = snapshot.body_json.get("data")
    assert isinstance(data, dict), "envelope tanpa data"
    return AgentCredential(
        agent_id=str(data.get("agent_id", "")),
        company_id=str(data.get("company_id", "")),
        hmac_secret=str(data.get("hmac_secret", "")),
        node_type=str(data.get("node_type", "")),
        asset_tag=str(data.get("asset_tag", "")),
    )


# ---------------------------------------------------------------------------
# Telemetry / uptime ingest (§2.2)
# ---------------------------------------------------------------------------
def ingest_inventory(
    client: W2ApiClient, cred: AgentCredential, payload: Mapping[str, Any]
) -> ApiResponseSnapshot:
    return client.post_agent_signed(
        f"{API}/agents/inventory/ingest", dict(payload),
        agent_id=cred.agent_id, secret=cred.hmac_secret,
    )


def build_metrics_payload(
    *,
    host: Mapping[str, Any] | None = None,
    containers: tuple[Mapping[str, Any], ...] = (),
    smart: tuple[Mapping[str, Any], ...] = (),
    snmp_interfaces: tuple[Mapping[str, Any], ...] = (),
) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if host is not None:
        payload["host"] = dict(host)
    if containers:
        payload["containers"] = [dict(c) for c in containers]
    if smart:
        payload["smart"] = [dict(s) for s in smart]
    if snmp_interfaces:
        payload["snmp_interfaces"] = [dict(s) for s in snmp_interfaces]
    return payload


def ingest_metrics(
    client: W2ApiClient, cred: AgentCredential, payload: Mapping[str, Any]
) -> ApiResponseSnapshot:
    return client.post_agent_signed(
        f"{API}/agents/metrics/ingest", dict(payload),
        agent_id=cred.agent_id, secret=cred.hmac_secret,
    )


def ingest_uptime(
    client: W2ApiClient, cred: AgentCredential, payload: Mapping[str, Any]
) -> ApiResponseSnapshot:
    return client.post_agent_signed(
        f"{API}/agents/uptime/ingest", dict(payload),
        agent_id=cred.agent_id, secret=cred.hmac_secret,
    )


def push_agent_logs(
    client: W2ApiClient,
    cred: AgentCredential,
    *,
    scope: str,
    reference: str,
    source: str,
    level: str,
    lines: list[str],
) -> ApiResponseSnapshot:
    payload = {
        "scope": scope,
        "reference": reference,
        "source": source,
        "level": level,
        "lines": lines,
    }
    return client.post_agent_signed(
        f"{API}/agents/logs", payload, agent_id=cred.agent_id, secret=cred.hmac_secret
    )


def unique_prefix() -> str:
    """Prefiks nama unik per sesi (stack name charset `[A-Za-z0-9_-]`)."""
    return f"qa-w2-{uuid.uuid4().hex[:10]}"
