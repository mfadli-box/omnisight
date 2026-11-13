"""QA-W2-S* — CRUD `compose.yaml` stack control plane (api-w2 §2.4)."""

from __future__ import annotations

import pytest

from application.infra_vectors import (
    dispatch_command_injections,
    invalid_compose_samples,
    traversal_working_dirs,
    valid_compose_sample,
    validate_compose_content,
    validate_working_dir,
)
from infrastructure.w2_client import data_of, error_code_of

pytestmark = [
    pytest.mark.integration,
    pytest.mark.contract,
    pytest.mark.wave2,
]

STACKS = "/api/v1/docker/stacks"
SECRET_ENV = "GF_SECURITY_ADMIN_PASSWORD=qa-super-secret-42"


def _payload(docker_host_id: str, name: str, **overrides) -> dict:
    base = {
        "docker_host_id": docker_host_id,
        "name": name,
        "working_dir": f"/opt/stacks/{name}",
        "compose_content": valid_compose_sample(),
        "env": SECRET_ENV,
    }
    base.update(overrides)
    return base


@pytest.fixture(scope="module")
def stack_name() -> str:
    from application.w2_flows import unique_prefix

    return unique_prefix()


@pytest.fixture(scope="module")
def created_stack_id(require_w2, admin_token, docker_host_id, stack_name) -> str:
    if not docker_host_id:
        pytest.skip("QA_W2_DOCKER_HOST_ID tidak diset — CRUD stack butuh FK host tenant")
    snapshot = require_w2.post_json(
        STACKS, _payload(docker_host_id, stack_name), token=admin_token
    )
    assert snapshot.status_code in (200, 201), (
        f"create stack valid gagal: HTTP {snapshot.status_code} "
        f"body={snapshot.body_text[:200]!r}"
    )
    stack_id = str(data_of(snapshot).get("id", ""))
    assert stack_id, "create stack tidak mengembalikan id"
    yield stack_id


def test_create_stack_env_never_echoed(
    require_w2, admin_token, docker_host_id, stack_name, created_stack_id
):
    """QA-W2-S01 — env plaintext tidak pernah muncul di respons apa pun."""
    stack = require_w2.get_json(f"{STACKS}/{created_stack_id}", token=admin_token)
    assert stack.status_code == 200
    assert SECRET_ENV not in stack.body_text, "env terenkripsi bocor di GET stack"
    listing = require_w2.get_json(STACKS, token=admin_token)
    assert SECRET_ENV not in listing.body_text, "env terenkripsi bocor di GET /stacks"


def test_create_duplicate_name_conflict(
    require_w2, admin_token, docker_host_id, stack_name
):
    """QA-W2-S02 — nama stack duplikat → 409 CONFLICT (UNIQUE per company)."""
    snapshot = require_w2.post_json(
        STACKS, _payload(docker_host_id, stack_name), token=admin_token
    )
    assert snapshot.status_code == 409, f"HTTP {snapshot.status_code}"
    assert error_code_of(snapshot) == "CONFLICT"


@pytest.mark.parametrize("label", sorted(invalid_compose_samples()))
def test_compose_structural_gate_rejects(require_w2, admin_token, docker_host_id, stack_name, label):
    """QA-W2-S03 — gerbang struktural compose menolak payload invalid (400)."""
    content = invalid_compose_samples()[label]
    mirror_errors = validate_compose_content(content)
    assert mirror_errors, f"vektor uji {label} seharusnya invalid menurut mirror"
    snapshot = require_w2.post_json(
        STACKS,
        _payload(docker_host_id, f"{stack_name}-{label[:20]}", compose_content=content),
        token=admin_token,
    )
    assert snapshot.status_code == 400, (
        f"compose invalid ({label}) diterima (HTTP {snapshot.status_code})"
    )
    assert error_code_of(snapshot) == "VALIDATION_ERROR"


@pytest.mark.parametrize("bad_dir", traversal_working_dirs())
def test_working_dir_traversal_rejected(require_w2, admin_token, docker_host_id, stack_name, bad_dir):
    """QA-W2-S04 — working_dir traversal/relative/backslash → 400."""
    assert validate_working_dir(bad_dir), f"vektor {bad_dir!r} seharusnya invalid"
    snapshot = require_w2.post_json(
        STACKS,
        _payload(docker_host_id, f"{stack_name}-wd", working_dir=bad_dir),
        token=admin_token,
    )
    assert snapshot.status_code == 400, (
        f"working_dir berbahaya {bad_dir!r} diterima (HTTP {snapshot.status_code})"
    )


def test_update_stack_and_backup_pointer(
    require_w2, admin_token, docker_host_id, created_stack_id
):
    """QA-W2-S05 — PUT compose baru → 200; pointer backup (bila ada) terisi."""
    snapshot = require_w2.put_json(
        f"{STACKS}/{created_stack_id}",
        _payload(docker_host_id, "qa-w2-ignored", compose_content=valid_compose_sample()),
        token=admin_token,
    )
    assert snapshot.status_code == 200, f"HTTP {snapshot.status_code}: {snapshot.body_text[:200]!r}"
    data = data_of(snapshot)
    if "backup_object_key" in data:
        key = str(data["backup_object_key"])
        assert not key.startswith("..") and "\\.." not in key, "object key backup mencurigakan"


def test_dispatch_up_queues_202(require_w2, admin_token, created_stack_id):
    """QA-W2-S06 — dispatch `up` → 202 QUEUED + dispatch_ref UUID."""
    snapshot = require_w2.post_json(
        f"{STACKS}/{created_stack_id}/dispatch", {"command": "up"}, token=admin_token
    )
    assert snapshot.status_code == 202, f"HTTP {snapshot.status_code}: {snapshot.body_text[:200]!r}"
    data = data_of(snapshot)
    assert data.get("command") == "up"
    assert str(data.get("dispatch_ref", "")), "dispatch_ref tidak dikembalikan"


@pytest.mark.parametrize("evil", dispatch_command_injections())
def test_dispatch_command_allowlist(require_w2, admin_token, created_stack_id, evil):
    """QA-W2-S07 — command di luar enum `up|down|pull|restart` → 400 (anti shell)."""
    snapshot = require_w2.post_json(
        f"{STACKS}/{created_stack_id}/dispatch", {"command": evil}, token=admin_token
    )
    assert snapshot.status_code == 400, (
        f"command injection {evil!r} diterima (HTTP {snapshot.status_code})"
    )
    assert error_code_of(snapshot) == "VALIDATION_ERROR"


def test_delete_stack_soft(require_w2, admin_token, docker_host_id, stack_name):
    """QA-W2-S08 — DELETE → 2xx; GET ulang → 404 (soft delete)."""
    created = require_w2.post_json(
        STACKS,
        _payload(docker_host_id, f"{stack_name}-del"),
        token=admin_token,
    )
    if created.status_code not in (200, 201):
        pytest.skip(f"stack tambahan gagal dibuat: HTTP {created.status_code}")
    stack_id = str(data_of(created).get("id", ""))
    deleted = require_w2.delete_json(f"{STACKS}/{stack_id}", token=admin_token)
    assert deleted.status_code in (200, 202, 204), f"HTTP {deleted.status_code}"
    gone = require_w2.get_json(f"{STACKS}/{stack_id}", token=admin_token)
    assert gone.status_code == 404, f"stack masih ada setelah delete: HTTP {gone.status_code}"
