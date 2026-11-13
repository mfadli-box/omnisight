"""Fixture pytest Wave 2 (rest_soc) — kredensial dari ENV, zero secret.

Variabel (opsional; test terkait SKIP bila kosong):
- ``SOC_W2_ADMIN_USERNAME`` / ``SOC_W2_ADMIN_PASSWORD``       → akun admin tenant QA
  (issue token enrollment + CRUD stack/vhost + dispatch). MFA: ``SOC_W2_ADMIN_MFA_SECRET``.
- ``SOC_W2_AGENT_ID`` / ``SOC_W2_AGENT_HMAC_SECRET``          → kredensial agent QA
  yang SUDAH ter-enroll (hex-64) — untuk vektor HMAC forgery/replay.
- ``SOC_W2_EXPIRED_ENROLLMENT_TOKEN`` (hex-64, opsional)      → token kedaluwarsa.
- ``SOC_W2_DOCKER_HOST_ID`` / ``SOC_W2_NGINX_NODE_ID``        → FK tenant sah agar
  penolakan 400 bisa diatribusikan ke validator (bukan FK tak dikenal).
"""

from __future__ import annotations

import json
import os
from typing import Iterator

import pytest

from infrastructure.security_client import HttpxSecurityClient
from infrastructure.w2_soc_client import W2SecurityClient, data_of

API = "/api/v1"


def _env(name: str) -> str:
    return os.environ.get(name, "")


@pytest.fixture(scope="session")
def soc_w2(require_target: HttpxSecurityClient) -> W2SecurityClient:
    return W2SecurityClient(require_target)


@pytest.fixture(scope="session")
def soc_admin_token(require_target: HttpxSecurityClient) -> Iterator[str]:
    """Login akun admin (opsional step-2 MFA) → access token tenant QA."""
    username = _env("SOC_W2_ADMIN_USERNAME")
    password = _env("SOC_W2_ADMIN_PASSWORD")
    if not (username and password):
        pytest.skip(
            "SOC_W2_ADMIN_USERNAME/SOC_W2_ADMIN_PASSWORD tidak diset — set akun "
            "admin tenant QA untuk audit Wave 2."
        )
    login = require_target.send(
        "POST",
        f"{API}/auth/login",
        headers={"Content-Type": "application/json"},
        content=json.dumps({"company_id": "", "username": username, "password": password}),
    )
    if login.status_code != 200:
        pytest.skip(f"login admin SOC gagal (HTTP {login.status_code}) — cek env akun")
    data = data_of(login)
    if data.get("mfa_required"):
        secret = _env("SOC_W2_ADMIN_MFA_SECRET")
        if not secret:
            pytest.skip("akun admin SOC MFA aktif tapi SOC_W2_ADMIN_MFA_SECRET tidak diset")
        challenge = data.get("mfa_challenge_token")
        assert challenge, "mfa_required tanpa challenge token — kontrak dilanggar"
        from application.w1_vectors import totp_code

        verified = require_target.send(
            "POST",
            f"{API}/auth/mfa/verify",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {challenge}",
            },
            content=json.dumps({"otp": totp_code(secret)}),
        )
        if verified.status_code != 200:
            pytest.skip(f"verify MFA admin SOC gagal (HTTP {verified.status_code})")
        data = data_of(verified)
    token = data.get("access_token")
    if not token:
        pytest.skip("login admin tidak mengembalikan access_token")
    yield str(token)


@pytest.fixture(scope="session")
def agent_credential() -> Iterator[tuple[str, str]]:
    agent_id = _env("SOC_W2_AGENT_ID")
    secret = _env("SOC_W2_AGENT_HMAC_SECRET")
    if not (agent_id and secret):
        pytest.skip(
            "SOC_W2_AGENT_ID/SOC_W2_AGENT_HMAC_SECRET tidak diset — set kredensial "
            "agent yang sudah ter-enroll untuk vektor HMAC forgery/replay."
        )
    yield agent_id, secret


@pytest.fixture(scope="session")
def docker_host_id() -> str:
    return _env("SOC_W2_DOCKER_HOST_ID")


@pytest.fixture(scope="session")
def nginx_node_id() -> str:
    return _env("SOC_W2_NGINX_NODE_ID")
