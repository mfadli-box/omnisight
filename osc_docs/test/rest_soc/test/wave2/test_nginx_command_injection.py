"""SOC-W2 Command Injection pada Nginx vhost & dispatch (API8:2023, CWE-78/77).

Defense-in-depth yang diuji (api-w2 §2.5/§4):
1. Validator struktural menolak config/server_name ber-metakarakter shell.
2. Endpoint dispatch HANYA menerima enum allowlist — API tidak pernah memanggil
   shell (payload injection tidak boleh masuk antrean `activity_logs`).
"""

from __future__ import annotations

import pytest

from application.w2_vectors import (
    dispatch_command_injections,
    nginx_server_name_injections,
    nginx_upstream_injection_configs,
    no_internal_leak,
)
from infrastructure.w2_soc_client import error_code

pytestmark = [
    pytest.mark.soc,
    pytest.mark.injection,
    pytest.mark.wave2,
]

VHOSTS = "/api/v1/nginx/vhosts"
SAFE_NAME = "soc-w2-cmdinj.example.test"
SAFE_CONF = (
    "server {\n  listen 80;\n  server_name app.example.com;\n"
    "  location / {\n    proxy_pass http://app;\n  }\n}\n"
)


def _vhost_payload(nginx_node_id: str, **overrides) -> dict:
    base = {
        "nginx_node_id": nginx_node_id,
        "server_name": SAFE_NAME,
        "listen_port": 80,
        "config_content": SAFE_CONF,
        "ssl_cert_path": "/etc/nginx/ssl/app.crt",
        "ssl_key_path": "/etc/nginx/ssl/app.key",
    }
    base.update(overrides)
    return base


@pytest.fixture(scope="module")
def require_nginx_node(soc_w2, soc_admin_token, nginx_node_id) -> str:
    if not nginx_node_id:
        pytest.skip(
            "SOC_W2_NGINX_NODE_ID tidak diset — tanpa FK node tenant yang sah, "
            "penolakan 400 tidak bisa diatribusikan ke validator injection"
        )
    return nginx_node_id


@pytest.fixture(scope="module")
def safe_vhost_id(soc_w2, soc_admin_token, require_nginx_node) -> str:
    """Vhost sah sebagai target dispatch (positive control)."""
    created = soc_w2.post_json(
        VHOSTS, _vhost_payload(require_nginx_node), token=soc_admin_token
    )
    if created.status_code not in (200, 201):
        pytest.skip(f"vhost kontrol gagal dibuat: HTTP {created.status_code}")
    data = created.body_excerpt
    del data
    from infrastructure.w2_soc_client import data_of

    vhost_id = str(data_of(created).get("id", ""))
    assert vhost_id, "create vhost kontrol tidak mengembalikan id"
    return vhost_id


@pytest.mark.parametrize("name", nginx_server_name_injections(), ids=lambda n: n[:18])
def test_server_name_injection_rejected(soc_w2, soc_admin_token, require_nginx_node, name):
    """SOC-W2-030 — server_name ber-metakarakter shell/directive → 400, tanpa 5xx."""
    evidence = soc_w2.post_json(
        VHOSTS,
        _vhost_payload(require_nginx_node, server_name=name),
        token=soc_admin_token,
    )
    assert evidence.status_code in (400, 409), (
        f"server_name {name!r} DITERIMA (HTTP {evidence.status_code}) — charset "
        "server_name tidak divalidasi; masuk potensi template/nginx parser abuse"
    )
    assert evidence.status_code < 500, "5xx = parser down / panic"
    assert no_internal_leak(evidence.body_excerpt)


@pytest.mark.parametrize("label", sorted(nginx_upstream_injection_configs()))
def test_upstream_injection_config_rejected(soc_w2, soc_admin_token, require_nginx_node, label):
    """SOC-W2-031 — config upstream/include traversal → 400 (validator brace+include)."""
    evidence = soc_w2.post_json(
        VHOSTS,
        _vhost_payload(
            require_nginx_node,
            config_content=nginx_upstream_injection_configs()[label],
        ),
        token=soc_admin_token,
    )
    assert evidence.status_code == 400, (
        f"config {label} DITERIMA (HTTP {evidence.status_code}) — include "
        "traversal / directive smuggle lolos gerbang"
    )
    assert error_code(evidence) == "VALIDATION_ERROR"
    assert no_internal_leak(evidence.body_excerpt)


@pytest.mark.parametrize("evil", dispatch_command_injections(), ids=lambda e: e[:16] or "empty")
def test_dispatch_command_injection_rejected(
    soc_w2, soc_admin_token, require_nginx_node, safe_vhost_id, evil
):
    """SOC-W2-032 — dispatch command non-enum (`up; cat /etc/shadow`) → 400."""
    evidence = soc_w2.post_json(
        f"{VHOSTS}/{safe_vhost_id}/dispatch", {"command": evil}, token=soc_admin_token
    )
    assert evidence.status_code == 400, (
        f"command injection {evil!r} diterima (HTTP {evidence.status_code}) — "
        "enum allowlist dispatch tidak ditegakkan"
    )
    assert error_code(evidence) == "VALIDATION_ERROR"
    assert "dispatch_ref" not in evidence.body_excerpt, (
        "payload injection MASUK ANTREAN (dispatch_ref diterbitkan) — shell bisa "
        "dieksekusi agent infra_control"
    )


def test_ssl_path_traversal_no_5xx(soc_w2, soc_admin_token, require_nginx_node):
    """SOC-W2-033 — ssl_cert_path traversal → ditolak rapi (tanpa 5xx/leak)."""
    evidence = soc_w2.post_json(
        VHOSTS,
        _vhost_payload(
            require_nginx_node,
            ssl_cert_path="../../etc/shadow",
            ssl_key_path="~/priv.key",
        ),
        token=soc_admin_token,
    )
    assert evidence.status_code < 500, (
        f"HTTP {evidence.status_code} — ssl path traversal menyebabkan error internal"
    )
    assert no_internal_leak(evidence.body_excerpt)


def test_dispatch_positive_control_allowlist(soc_w2, soc_admin_token, safe_vhost_id):
    """SOC-W2-034 — kontrol positif: `test_reload` sah → 202 (allowlist bukan blok total)."""
    evidence = soc_w2.post_json(
        f"{VHOSTS}/{safe_vhost_id}/dispatch", {"command": "test_reload"},
        token=soc_admin_token,
    )
    assert evidence.status_code == 202, (
        f"dispatch sah gagal: HTTP {evidence.status_code} — endpoint/allowlist rusak"
    )
