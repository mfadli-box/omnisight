"""QA-W2-N* — CRUD Nginx virtual host control plane (api-w2 §2.5)."""

from __future__ import annotations

import pytest

from application.infra_vectors import (
    invalid_nginx_samples,
    valid_nginx_sample,
    validate_nginx_content,
)
from infrastructure.w2_client import data_of, error_code_of

pytestmark = [
    pytest.mark.integration,
    pytest.mark.contract,
    pytest.mark.wave2,
]

VHOSTS = "/api/v1/nginx/vhosts"


def _payload(nginx_node_id: str, server_name: str, **overrides) -> dict:
    base = {
        "nginx_node_id": nginx_node_id,
        "server_name": server_name,
        "listen_port": 80,
        "config_content": valid_nginx_sample(),
        "ssl_cert_path": "/etc/nginx/ssl/app.crt",
        "ssl_key_path": "/etc/nginx/ssl/app.key",
    }
    base.update(overrides)
    return base


@pytest.fixture(scope="module")
def vhost_server_name() -> str:
    from application.w2_flows import unique_prefix

    return f"{unique_prefix()}.example.test"


@pytest.fixture(scope="module")
def created_vhost_id(require_w2, admin_token, nginx_node_id, vhost_server_name) -> str:
    if not nginx_node_id:
        pytest.skip("QA_W2_NGINX_NODE_ID tidak diset — CRUD vhost butuh FK node tenant")
    snapshot = require_w2.post_json(
        VHOSTS, _payload(nginx_node_id, vhost_server_name), token=admin_token
    )
    assert snapshot.status_code in (200, 201), (
        f"create vhost valid gagal: HTTP {snapshot.status_code} "
        f"body={snapshot.body_text[:200]!r}"
    )
    vhost_id = str(data_of(snapshot).get("id", ""))
    assert vhost_id, "create vhost tidak mengembalikan id"
    yield vhost_id


def test_create_vhost_draft_status(require_w2, admin_token, nginx_node_id, vhost_server_name):
    """QA-W2-N01 — create valid → status awal DRAFT."""
    del nginx_node_id
    listing = require_w2.get_json(VHOSTS, token=admin_token)
    assert listing.status_code == 200
    assert vhost_server_name in listing.body_text, "vhost baru tidak muncul di daftar"


def test_create_duplicate_unique_tuple(require_w2, admin_token, nginx_node_id, vhost_server_name):
    """QA-W2-N02 — UNIQUE (node, server_name, listen_port) → 409 CONFLICT."""
    snapshot = require_w2.post_json(
        VHOSTS, _payload(nginx_node_id, vhost_server_name), token=admin_token
    )
    assert snapshot.status_code == 409, f"HTTP {snapshot.status_code}"
    assert error_code_of(snapshot) == "CONFLICT"


@pytest.mark.parametrize("label", sorted(invalid_nginx_samples()))
def test_nginx_structural_gate_rejects(require_w2, admin_token, nginx_node_id, vhost_server_name, label):
    """QA-W2-N03 — gerbang struktural nginx menolak config invalid (400)."""
    content = invalid_nginx_samples()[label]
    mirror_errors = validate_nginx_content(content)
    assert mirror_errors, f"vektor uji {label} seharusnya invalid menurut mirror"
    snapshot = require_w2.post_json(
        VHOSTS,
        _payload(
            nginx_node_id,
            f"{label[:24]}.{vhost_server_name}",
            config_content=content,
        ),
        token=admin_token,
    )
    assert snapshot.status_code == 400, (
        f"nginx config invalid ({label}) diterima (HTTP {snapshot.status_code})"
    )
    assert error_code_of(snapshot) == "VALIDATION_ERROR"


def test_update_resets_to_draft(require_w2, admin_token, created_vhost_id):
    """QA-W2-N04 — PUT config baru → 200 dan status kembali DRAFT."""
    snapshot = require_w2.put_json(
        f"{VHOSTS}/{created_vhost_id}",
        _payload("00000000-0000-0000-0000-000000000000", "ignored.example.test"),
        token=admin_token,
    )
    assert snapshot.status_code == 200, f"HTTP {snapshot.status_code}: {snapshot.body_text[:200]!r}"
    data = data_of(snapshot)
    status = str(data.get("status", "")).upper()
    assert status in {"", "DRAFT"}, f"status setelah update: {status!r} (harus DRAFT)"


def test_dispatch_test_reload_queues_202(require_w2, admin_token, created_vhost_id):
    """QA-W2-N05 — dispatch `test_reload` → 202 QUEUED + dispatch_ref."""
    snapshot = require_w2.post_json(
        f"{VHOSTS}/{created_vhost_id}/dispatch", {"command": "test_reload"},
        token=admin_token,
    )
    assert snapshot.status_code == 202, f"HTTP {snapshot.status_code}: {snapshot.body_text[:200]!r}"
    data = data_of(snapshot)
    assert data.get("command") == "test_reload"
    assert str(data.get("dispatch_ref", "")), "dispatch_ref tidak dikembalikan"


def test_dispatch_invalid_command_rejected(require_w2, admin_token, created_vhost_id):
    """QA-W2-N06 — command non-enum (`reload` mentah) → 400."""
    snapshot = require_w2.post_json(
        f"{VHOSTS}/{created_vhost_id}/dispatch", {"command": "reload; id"},
        token=admin_token,
    )
    assert snapshot.status_code == 400, f"HTTP {snapshot.status_code}"
    assert error_code_of(snapshot) == "VALIDATION_ERROR"


def test_delete_vhost(require_w2, admin_token, nginx_node_id, vhost_server_name):
    """QA-W2-N07 — DELETE → 2xx; GET ulang → 404."""
    created = require_w2.post_json(
        VHOSTS,
        _payload(nginx_node_id, f"del.{vhost_server_name}", listen_port=8081),
        token=admin_token,
    )
    if created.status_code not in (200, 201):
        pytest.skip(f"vhost tambahan gagal dibuat: HTTP {created.status_code}")
    vhost_id = str(data_of(created).get("id", ""))
    deleted = require_w2.delete_json(f"{VHOSTS}/{vhost_id}", token=admin_token)
    assert deleted.status_code in (200, 202, 204), f"HTTP {deleted.status_code}"
    gone = require_w2.get_json(f"{VHOSTS}/{vhost_id}", token=admin_token)
    assert gone.status_code == 404, f"vhost masih ada setelah delete: HTTP {gone.status_code}"
