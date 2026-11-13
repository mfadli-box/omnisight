"""SOC-W2 Path Traversal pada stack `compose.yaml` (API8:2023, CWE-22/23).

Target vektor utama: nama stack `../../etc/cron.d` + working_dir traversal —
uji gerbang validasi SEBELUM backup RustFS & dispatch (api-w2 §2.4/§4).
"""

from __future__ import annotations

import pytest

from application.w2_vectors import (
    no_internal_leak,
    traversal_compose_payloads,
    traversal_stack_names,
    traversal_working_dirs,
)
from infrastructure.w2_soc_client import error_code

pytestmark = [
    pytest.mark.soc,
    pytest.mark.injection,
    pytest.mark.wave2,
]

STACKS = "/api/v1/docker/stacks"
SAFE_NAME = "soc-w2-traversal-probe"
SAFE_COMPOSE = "services:\n  web:\n    image: nginx:1\n"


def _stack_payload(docker_host_id: str, **overrides) -> dict:
    base = {
        "docker_host_id": docker_host_id,
        "name": SAFE_NAME,
        "working_dir": "/opt/stacks/soc-w2-probe",
        "compose_content": SAFE_COMPOSE,
        "env": "",
    }
    base.update(overrides)
    return base


@pytest.fixture(scope="module")
def require_docker_host(soc_w2, soc_admin_token, docker_host_id) -> str:
    if not docker_host_id:
        pytest.skip(
            "SOC_W2_DOCKER_HOST_ID tidak diset — tanpa FK host tenant yang sah, "
            "penolakan 400 tidak bisa diatribusikan ke validator traversal"
        )
    return docker_host_id


@pytest.mark.parametrize("name", traversal_stack_names(), ids=lambda n: n[:20] or "empty")
def test_stack_name_traversal_rejected(soc_w2, soc_admin_token, require_docker_host, name):
    """SOC-W2-020 — nama stack traversal (`../../etc/cron.d`, encod `%2F`) → 400."""
    evidence = soc_w2.post_json(
        STACKS, _stack_payload(require_docker_host, name=name), token=soc_admin_token
    )
    assert evidence.status_code == 400, (
        f"nama stack {name!r} DITERIMA (HTTP {evidence.status_code}) — regex "
        "[a-zA-Z0-9_-] tidak ditegakkan; risiko tulis file di luar working_dir"
    )
    assert error_code(evidence) == "VALIDATION_ERROR"
    assert no_internal_leak(evidence.body_excerpt)


@pytest.mark.parametrize("path", traversal_working_dirs(), ids=lambda p: p[:24])
def test_working_dir_traversal_rejected(soc_w2, soc_admin_token, require_docker_host, path):
    """SOC-W2-021 — working_dir `..`, `~`, `\`, control char → 400."""
    evidence = soc_w2.post_json(
        STACKS,
        _stack_payload(require_docker_host, working_dir=path),
        token=soc_admin_token,
    )
    assert evidence.status_code == 400, (
        f"working_dir {path!r} DITERIMA (HTTP {evidence.status_code}) — compose "
        "bisa dieksekusi di luar root stack (eksfil /etc/cron.d)"
    )
    assert error_code(evidence) == "VALIDATION_ERROR"


@pytest.mark.parametrize("label", sorted(traversal_compose_payloads()))
def test_compose_content_smuggled_path_rejected(
    soc_w2, soc_admin_token, require_docker_host, label
):
    """SOC-W2-022 — compose menyelundup path (include/env_file/bind /etc) → 400."""
    evidence = soc_w2.post_json(
        STACKS,
        _stack_payload(require_docker_host, compose_content=traversal_compose_payloads()[label]),
        token=soc_admin_token,
    )
    assert evidence.status_code == 400, (
        f"compose {label} DITERIMA (HTTP {evidence.status_code}) — allowlist "
        "top-level & gerbang bind tidak menutup jalur traversal"
    )
    assert error_code(evidence) == "VALIDATION_ERROR"
    assert no_internal_leak(evidence.body_excerpt)


def test_no_stack_created_by_traversal_attempts(
    soc_w2, soc_admin_token, require_docker_host
):
    """SOC-W2-023 — setelah seluruh percobaan, TIDAK ADA stack traversal tersimpan."""
    for name in traversal_stack_names():
        soc_w2.post_json(
            STACKS, _stack_payload(require_docker_host, name=name), token=soc_admin_token
        )
    listing = soc_w2.get_json(STACKS, token=soc_admin_token)
    assert listing.status_code == 200, f"HTTP {listing.status_code}"
    for name in traversal_stack_names():
        assert name not in listing.body_excerpt, (
            f"stack berbahaya {name!r} tersimpan — traversal SUDAH persist"
        )


def test_oversize_compose_rejected(soc_w2, soc_admin_token, require_docker_host):
    """SOC-W2-024 — compose > 256 KB → 400/413 (payload bomb gate)."""
    huge = "services:\n  web:\n    image: nginx:1\n    labels: \"" + "A" * (300 * 1024) + "\"\n"
    evidence = soc_w2.post_json(
        STACKS,
        _stack_payload(require_docker_host, compose_content=huge),
        token=soc_admin_token,
    )
    assert evidence.status_code in (400, 413), (
        f"compose 300 KB diterima (HTTP {evidence.status_code}) — batas 256 KB dilanggar"
    )
    assert no_internal_leak(evidence.body_excerpt)
