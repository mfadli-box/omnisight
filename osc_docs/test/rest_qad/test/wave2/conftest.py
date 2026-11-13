"""Fixture pytest Wave 2 (rest_qad) — kredensial & referensi dari ENV (zero secret).

Variabel yang dipakai (semua opsional; test terkait SKIP bila kosong):
- ``QA_W2_ADMIN_USERNAME`` / ``QA_W2_ADMIN_PASSWORD``            → akun admin
  (role ber-nama ``*admin``) untuk terbitkan token enrollment & CRUD infra.
- ``QA_W2_ADMIN_MFA_SECRET`` (base32, opsional)                 → bila admin MFA aktif.
- ``QA_W2_MEMBER_USERNAME`` / ``QA_W2_MEMBER_PASSWORD``         → akun non-admin (uji 403).
- ``QA_W2_COMPANY_ID``                                          → company tenant QA (konsistensi enroll).
- ``QA_W2_ASSET_MODEL_ID`` / ``QA_W2_STATUS_LABEL_ID``          → wajib enroll (api-w2 §2.1).
- ``QA_W2_DOCKER_HOST_ID`` / ``QA_W2_NGINX_NODE_ID``            → referensi FK CRUD stack/vhost.
"""

from __future__ import annotations

import os
from typing import Iterator

import pytest

from application.w2_flows import (
    credential_of,
    enroll_agent,
    issue_enrollment_token,
    parsed_token,
)
from domain.errors import UnreachableTargetError
from domain.models_w2 import AgentCredential
from infrastructure.config import TargetConfig
from infrastructure.w2_client import W2HttpxClient, data_of

API = "/api/v1"
HEALTH_PATH = "/api/v1/health"


def _env(name: str) -> str:
    return os.environ.get(name, "")


@pytest.fixture(scope="session")
def w2_config() -> TargetConfig:
    return TargetConfig.from_env()


@pytest.fixture(scope="session")
def w2(w2_config: TargetConfig) -> Iterator[W2HttpxClient]:
    client = W2HttpxClient(w2_config)
    yield client
    client.close()


@pytest.fixture(scope="session")
def require_w2(w2: W2HttpxClient) -> W2HttpxClient:
    """Gate deterministik: target wajib osc_rest milik workspace ini."""
    try:
        probe = w2.get_json(HEALTH_PATH)
    except UnreachableTargetError as exc:
        pytest.skip(f"target osc_rest tidak terjangkau — lewati test live: {exc}")
    if probe.status_code not in (200, 503):
        pytest.skip(
            f"target bukan osc_rest (health HTTP {probe.status_code}) — set "
            "QA_TARGET_BASE_URL; trafik test tidak dikirim ke layanan asing."
        )
    return w2


@pytest.fixture(scope="session")
def admin_token(require_w2: W2HttpxClient) -> Iterator[str]:
    """Login akun admin (opsional step-2 MFA via secret base32) → access token."""
    username = _env("QA_W2_ADMIN_USERNAME")
    password = _env("QA_W2_ADMIN_PASSWORD")
    if not (username and password):
        pytest.skip(
            "QA_W2_ADMIN_USERNAME/QA_W2_ADMIN_PASSWORD tidak diset — set akun "
            "admin tenant QA untuk test Wave 2."
        )
    snapshot = require_w2.post_json(
        f"{API}/auth/login",
        {"company_id": "", "username": username, "password": password},
    )
    if snapshot.status_code != 200:
        pytest.skip(f"login admin gagal (HTTP {snapshot.status_code}) — cek env akun")
    data = data_of(snapshot)
    if data.get("mfa_required"):
        secret = _env("QA_W2_ADMIN_MFA_SECRET")
        if not secret:
            pytest.skip("akun admin MFA aktif tapi QA_W2_ADMIN_MFA_SECRET tidak diset")
        challenge = data.get("mfa_challenge_token")
        assert challenge, "mfa_required tanpa challenge token — kontrak dilanggar"
        from application.totp import totp_code

        verified = require_w2.post_json(
            f"{API}/auth/mfa/verify",
            {"otp": totp_code(secret)},
            token=str(challenge),
        )
        if verified.status_code != 200:
            pytest.skip(f"verify MFA admin gagal (HTTP {verified.status_code})")
        data = data_of(verified)
    token = data.get("access_token")
    if not token:
        pytest.skip("login admin tidak mengembalikan access_token")
    yield str(token)


@pytest.fixture(scope="session")
def member_token(require_w2: W2HttpxClient) -> Iterator[str]:
    username = _env("QA_W2_MEMBER_USERNAME")
    password = _env("QA_W2_MEMBER_PASSWORD")
    if not (username and password):
        pytest.skip(
            "QA_W2_MEMBER_USERNAME/QA_W2_MEMBER_PASSWORD tidak diset — set akun "
            "non-admin untuk uji gate admin (403)."
        )
    snapshot = require_w2.post_json(
        f"{API}/auth/login",
        {"company_id": "", "username": username, "password": password},
    )
    if snapshot.status_code != 200:
        pytest.skip(f"login member gagal (HTTP {snapshot.status_code})")
    data = require_w2.data_of(snapshot)
    token = data.get("access_token")
    if not token:
        pytest.skip("login member tidak mengembalikan access_token (mungkin MFA)")
    yield str(token)


@pytest.fixture(scope="session")
def company_id() -> str:
    return _env("QA_W2_COMPANY_ID")


@pytest.fixture(scope="session")
def enroll_refs() -> Iterator[tuple[str, str]]:
    model_id = _env("QA_W2_ASSET_MODEL_ID")
    label_id = _env("QA_W2_STATUS_LABEL_ID")
    if not (model_id and label_id):
        pytest.skip(
            "QA_W2_ASSET_MODEL_ID/QA_W2_STATUS_LABEL_ID tidak diset — enroll "
            "butuh model & status label milik company token (api-w2 §2.1)."
        )
    yield model_id, label_id


@pytest.fixture(scope="session")
def enrolled_agent(
    require_w2: W2HttpxClient,
    admin_token: str,
    enroll_refs: tuple[str, str],
    company_id: str,
) -> Iterator[AgentCredential]:
    """Enroll satu agent QA khusus Wave 2 (token baru per sesi)."""
    model_id, label_id = enroll_refs
    issued = issue_enrollment_token(require_w2, token=admin_token, node_type="HOST")
    assert issued.status_code == 201, (
        f"issue enrollment token gagal: HTTP {issued.status_code} "
        f"body={issued.body_text[:200]!r}"
    )
    token = parsed_token(issued)
    snapshot = enroll_agent(
        require_w2,
        enrollment_token=token.token,
        hostname=f"qa-w2-{os.urandom(4).hex()}",
        mgmt_ip="10.10.254.77",
        asset_model_id=model_id,
        status_label_id=label_id,
    )
    assert snapshot.status_code == 201, (
        f"enroll agent QA gagal: HTTP {snapshot.status_code} "
        f"body={snapshot.body_text[:200]!r}"
    )
    cred = credential_of(snapshot)
    if company_id:
        assert cred.company_id == company_id, "company_id enroll ≠ company token"
    yield cred


@pytest.fixture(scope="session")
def docker_host_id() -> str:
    return _env("QA_W2_DOCKER_HOST_ID")


@pytest.fixture(scope="session")
def nginx_node_id() -> str:
    return _env("QA_W2_NGINX_NODE_ID")
