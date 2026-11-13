"""Fixture pytest Wave 3 (rest_soc) — kredensial dari ENV, zero secret.

Variabel (opsional; test terkait SKIP bila kosong):
- ``SOC_W3_PAM_USERNAME`` / ``SOC_W3_PAM_PASSWORD`` / ``SOC_W3_PAM_MFA_SECRET``
  → akun PAM tenant QA dengan `mfa_enabled == true` (login TOTP → step-up
  segar; dipakai kontrol positif authorize 201 & pemindaian kebocoran vault).
- ``SOC_W3_PAM_BACKUP_CODE`` → kode cadangan sekali pakai; login via backup
  code menyimpan `mfa_last_verified_step = 0` → step-up PASTI kedaluwarsa
  (> 15 menit) tanpa menunggu waktu (api-w3 §1.1) — deterministik.
- ``SOC_W3_NOMFA_USERNAME`` / ``SOC_W3_NOMFA_PASSWORD``
  → akun dengan `mfa_enabled == false` (target utama `403 MFA_REQUIRED_FOR_PAM`).
- ``SOC_W3_SUPERADMIN_NOMFA_USERNAME`` / ``..._PASSWORD`` (opsional)
  → bukti penolakan tanpa kecuali role (super admin pun ditolak).
- ``SOC_W3_PAM_ACCOUNT_ID`` → UUID akun vault milik tenant QA (FK authorize).
- ``SOC_W3_GATEWAY_AGENT_ID`` / ``SOC_W3_GATEWAY_HMAC_SECRET``
  → kredensial agent `pam_bastion_gateway` yang SUDAH ter-enroll (redeem).
- ``SOC_W3_AGENT_ID`` / ``SOC_W3_AGENT_HMAC_SECRET``
  → kredensial agent QA ter-enroll (ingest SIEM ber-HMAC sah / anti-spoof).
- ``SOC_W3_EXPIRED_TICKET`` + ``SOC_W3_EXPIRED_SESSION_ID`` (opsional)
  → pasangan ticket/sesi kedaluwarsa (> TTL) untuk uji 401.
- ``SOC_W3_VAULT_SECRET_CANARY`` (opsional) → plaintext secret akun vault QA;
  SEMUA respons dipindai — kemunculannya di luar redeem internal = temuan.
- ``SOC_W3_ALLOW_LOCKOUT`` (opsional, default mati) → mengizinkan uji lockout
  OTP (5 gagal → 429) yang mengunci akun PAM QA selama 15 menit; jalankan
  TERAKHIR atau pada akun khusus.
"""

from __future__ import annotations

import json
import os
from typing import Iterator

import pytest

from infrastructure.security_client import HttpxSecurityClient
from infrastructure.w3_soc_client import W3SecurityClient, data_of
from infrastructure.w2_soc_client import error_code

API = "/api/v1"


def _env(name: str) -> str:
    return os.environ.get(name, "")


def _login_token(
    client: HttpxSecurityClient,
    username: str,
    password: str,
    *,
    otp: str = "",
    skip_reason: str,
) -> str:
    """Login + verifikasi MFA → access token.

    ``otp`` dikirim apa adanya pada `/auth/mfa/verify`: TOTP 6 digit (hasil
    `totp_code`) ATAU kode cadangan raw (login backup-code → step tersimpan 0).
    """
    login = client.send(
        "POST",
        f"{API}/auth/login",
        headers={"Content-Type": "application/json"},
        content=json.dumps({"company_id": "", "username": username, "password": password}),
    )
    if login.status_code != 200:
        pytest.skip(f"login gagal (HTTP {login.status_code}) — {skip_reason}")
    data = data_of(login)
    if data.get("mfa_required"):
        challenge = data.get("mfa_challenge_token")
        assert challenge, "mfa_required tanpa challenge token — kontrak dilanggar"
        if not otp:
            pytest.skip(f"akun MFA aktif tapi TOTP/backup code tidak diset — {skip_reason}")
        verified = client.send(
            "POST",
            f"{API}/auth/mfa/verify",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {challenge}",
            },
            content=json.dumps({"otp": otp}),
        )
        if verified.status_code != 200:
            pytest.skip(f"verifikasi MFA gagal (HTTP {verified.status_code}) — {skip_reason}")
        data = data_of(verified)
    token = data.get("access_token")
    if not token:
        pytest.skip("login tidak mengembalikan access_token")
    return str(token)


@pytest.fixture(scope="session")
def soc_w3(require_target: HttpxSecurityClient) -> W3SecurityClient:
    return W3SecurityClient(require_target)


@pytest.fixture(scope="session")
def pam_fresh_token(require_target: HttpxSecurityClient) -> Iterator[str]:
    """Token akun PAM (mfa_enabled=true) — TOTP → step-up segar (< window)."""
    from application.w1_vectors import totp_code

    username, password = _env("SOC_W3_PAM_USERNAME"), _env("SOC_W3_PAM_PASSWORD")
    if not (username and password):
        pytest.skip(
            "SOC_W3_PAM_USERNAME/SOC_W3_PAM_PASSWORD tidak diset — set akun PAM "
            "tenant QA (mfa_enabled=true) untuk audit Wave 3."
        )
    yield _login_token(
        require_target, username, password,
        otp=totp_code(_env("SOC_W3_PAM_MFA_SECRET")) if _env("SOC_W3_PAM_MFA_SECRET") else "",
        skip_reason="audit PAM user MFA",
    )


@pytest.fixture(scope="session")
def pam_stale_token(require_target: HttpxSecurityClient) -> Iterator[str]:
    """Token akun PAM dengan STEP-UP KEDALUWARSA — login via backup code
    (step tersimpan 0 → usia verifikasi = now×30 s ≫ 15 menit, api-w3 §1.1)."""
    backup = _env("SOC_W3_PAM_BACKUP_CODE")
    if not backup:
        pytest.skip(
            "SOC_W3_PAM_BACKUP_CODE tidak diset — login backup-code diperlukan "
            "untuk mensimulasikan step-up kedaluwarsa secara deterministik."
        )
    username, password = _env("SOC_W3_PAM_USERNAME"), _env("SOC_W3_PAM_PASSWORD")
    if not (username and password):
        pytest.skip("SOC_W3_PAM_USERNAME/SOC_W3_PAM_PASSWORD tidak diset")
    yield _login_token(
        require_target, username, password,
        otp=backup,
        skip_reason="simulasi step-up kedaluwarsa (backup code)",
    )


@pytest.fixture(scope="session")
def nomfa_token(require_target: HttpxSecurityClient) -> Iterator[str]:
    """Token akun TANPA MFA (`mfa_enabled == false`) — target uji utama."""
    username, password = _env("SOC_W3_NOMFA_USERNAME"), _env("SOC_W3_NOMFA_PASSWORD")
    if not (username and password):
        pytest.skip(
            "SOC_W3_NOMFA_USERNAME/SOC_W3_NOMFA_PASSWORD tidak diset — set akun "
            "tanpa MFA untuk uji penolakan 403 MFA_REQUIRED_FOR_PAM."
        )
    yield _login_token(
        require_target, username, password, otp="", skip_reason="audit no-MFA"
    )


@pytest.fixture(scope="session")
def nomfa_superadmin_token(require_target: HttpxSecurityClient) -> Iterator[str]:
    """(Opsional) token super admin TANPA MFA — PAM wajib menolak tanpa kecuali."""
    username = _env("SOC_W3_SUPERADMIN_NOMFA_USERNAME")
    password = _env("SOC_W3_SUPERADMIN_NOMFA_PASSWORD")
    if not (username and password):
        pytest.skip(
            "SOC_W3_SUPERADMIN_NOMFA_* tidak diset — uji 'tanpa kecuali role' "
            "dilewati."
        )
    yield _login_token(
        require_target, username, password, otp="", skip_reason="audit super admin no-MFA"
    )


@pytest.fixture(scope="session")
def pam_account_id() -> str:
    account_id = _env("SOC_W3_PAM_ACCOUNT_ID")
    if not account_id:
        pytest.skip(
            "SOC_W3_PAM_ACCOUNT_ID tidak diset — UUID akun vault tenant QA "
            "diperlukan untuk authorize."
        )
    return account_id


@pytest.fixture(scope="session")
def gateway_credential() -> Iterator[tuple[str, str]]:
    agent_id = _env("SOC_W3_GATEWAY_AGENT_ID")
    secret = _env("SOC_W3_GATEWAY_HMAC_SECRET")
    if not (agent_id and secret):
        pytest.skip(
            "SOC_W3_GATEWAY_AGENT_ID/SOC_W3_GATEWAY_HMAC_SECRET tidak diset — "
            "kredensial agent pam_bastion_gateway ter-enroll diperlukan."
        )
    yield agent_id, secret


@pytest.fixture(scope="session")
def ingest_agent_credential() -> Iterator[tuple[str, str]]:
    agent_id = _env("SOC_W3_AGENT_ID")
    secret = _env("SOC_W3_AGENT_HMAC_SECRET")
    if not (agent_id and secret):
        pytest.skip(
            "SOC_W3_AGENT_ID/SOC_W3_AGENT_HMAC_SECRET tidak diset — kredensial "
            "agent ingest QA diperlukan untuk vektor anti-spoof ber-HMAC sah."
        )
    yield agent_id, secret


@pytest.fixture(scope="session")
def vault_canaries() -> tuple[str, ...]:
    canary = _env("SOC_W3_VAULT_SECRET_CANARY")
    return (canary,) if canary else ()
