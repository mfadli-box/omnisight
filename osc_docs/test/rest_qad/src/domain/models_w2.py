"""Model domain Wave 2 — pure dataclass, zero I/O/httpx/pytest.

Sumber kontrak: ``osc_docs/rest/api-w2.md`` (§2.1 enrollment, §2.2 ingest,
§2.4 docker stack, §2.5 nginx vhost).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EnrollmentToken:
    """Token enrollment one-time (hex-64, ditampilkan sekali)."""

    id: str
    token: str
    node_type: str
    expires_at: str  # ISO-8601 UTC dari respons API


@dataclass(frozen=True)
class AgentCredential:
    """Kredensial agent hasil enroll (hmac_secret plaintext, sekali tampil)."""

    agent_id: str
    company_id: str
    hmac_secret: str
    node_type: str
    asset_tag: str


@dataclass(frozen=True)
class StackDraft:
    """Payload CRUD `compose_stacks` (belum terenkripsi — env plaintext uji)."""

    docker_host_id: str
    name: str
    working_dir: str
    compose_content: str
    env: str = ""


@dataclass(frozen=True)
class VhostDraft:
    """Payload CRUD `nginx_virtual_hosts`."""

    nginx_node_id: str
    server_name: str
    listen_port: int
    config_content: str
    ssl_cert_path: str = ""
    ssl_key_path: str = ""


@dataclass(frozen=True)
class IngestSummary:
    """Ringkasan respons `POST /agents/metrics/ingest` (202)."""

    system_rows: int
    container_rows: int
    interface_rows: int
    smart_reports: int
    alert_events: int
