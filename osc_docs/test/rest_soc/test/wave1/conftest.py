"""Fixture pytest Wave 1 (rest_soc) — kredensial dari ENV, zero secret.

Variabel (opsional; test terkait SKIP bila kosong):
- ``SOC_W1_USERNAME`` / ``SOC_W1_PASSWORD`` / ``SOC_W1_MFA_SECRET`` (base32)
  → sesi terautentikasi tenant QA (audit lintas tenant / filter AST / Excel).
- ``SOC_W1_FOREIGN_COMPANY_ID`` → company asing milik tenant lain (target IDOR).
- ``SOC_W1_FOREIGN_ASSET_ID``   → id aset milik tenant asing (uji BOLA objek).
- ``SOC_W1_COLLECTION`` (default "qa_soc_wave1") → koleksi Studio uji SQLi.
"""

from __future__ import annotations

import json
import os
from typing import Iterator

import pytest

from infrastructure.security_client import HttpxSecurityClient
from infrastructure.w1_soc_client import W1SecurityClient, data_of

API = "/api/v1"


@pytest.fixture(scope="session")
def soc_w1(require_target: HttpxSecurityClient) -> W1SecurityClient:
    return W1SecurityClient(require_target)


def _env(name: str) -> str:
    return os.environ.get(name, "")


@pytest.fixture(scope="session")
def soc_session_token(require_target: HttpxSecurityClient) -> Iterator[str]:
    """Login (opsional step-2 MFA via secret base32) → access token tenant QA."""
    username = _env("SOC_W1_USERNAME")
    password = _env("SOC_W1_PASSWORD")
    if not (username and password):
        pytest.skip(
            "SOC_W1_USERNAME/SOC_W1_PASSWORD tidak diset — set kredensial akun "
            "tenant QA untuk audit terautentikasi."
        )
    login = require_target.send(
        "POST",
        f"{API}/auth/login",
        headers={"Content-Type": "application/json"},
        content=json.dumps({"company_id": "", "username": username, "password": password}),
    )
    if login.status_code != 200:
        pytest.skip(f"login SOC gagal (HTTP {login.status_code}) — cek env akun")
    data = data_of(login)
    if data.get("mfa_required"):
        secret = _env("SOC_W1_MFA_SECRET")
        if not secret:
            pytest.skip("akun SOC MFA aktif tapi SOC_W1_MFA_SECRET tidak diset")
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
            pytest.skip(f"verify MFA SOC gagal (HTTP {verified.status_code})")
        data = data_of(verified)
    token = data.get("access_token")
    if not token:
        pytest.skip("login tidak mengembalikan access_token")
    yield str(token)


@pytest.fixture(scope="session")
def foreign_company_id() -> str:
    return _env("SOC_W1_FOREIGN_COMPANY_ID")


@pytest.fixture(scope="session")
def foreign_asset_id() -> str:
    return _env("SOC_W1_FOREIGN_ASSET_ID")


@pytest.fixture(scope="session")
def soc_collection() -> str:
    return _env("SOC_W1_COLLECTION", "qa_soc_wave1")
