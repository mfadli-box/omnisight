"""Fixture pytest Wave 1 (rest_qad) — kredensial & akun dari ENV (zero secret).

Variabel yang dipakai (semua opsional; test terkait SKIP bila kosong):
- ``QA_W1_LOCAL_USERNAME`` / ``QA_W1_LOCAL_PASSWORD``     → Local Login
- ``QA_W1_MFA_USERNAME`` / ``QA_W1_MFA_PASSWORD`` /
  ``QA_W1_MFA_SECRET`` (base32) / ``QA_W1_MFA_BACKUP_CODE`` → akun MFA aktif
  (catatan: backup code konsumsi-sekali-pakai — sediakan kode belum terpakai)
- ``QA_W1_HRIS_COMPANY_ID`` / ``QA_W1_HRIS_USERNAME`` /
  ``QA_W1_HRIS_PASSWORD`` / ``QA_W1_HRIS_STUB_PORT``       → perusahaan HRIS
  (company.hris_login_url sudah dikonfigurasi menunjuk stub di 127.0.0.1)
- ``QA_W1_HRIS_CACHE_TTL_OK`` (default "true")             → ekspektasi fallback
- ``QA_W1_SWITCH_COMPANY_ID`` / ``QA_W1_FORBIDDEN_COMPANY_ID`` → switcher
- ``QA_W1_COLLECTION`` (default "qa_wave1")                → koleksi Studio
"""

from __future__ import annotations

import os
from typing import Iterator

import pytest

from application.w1_flows import login
from domain.errors import UnreachableTargetError
from domain.models_w1 import LoginChannel, LoginExpectation
from infrastructure.config import TargetConfig
from infrastructure.w1_client import W1HttpxClient

HEALTH_PATH = "/api/v1/health"


@pytest.fixture(scope="session")
def w1_config() -> TargetConfig:
    return TargetConfig.from_env()


@pytest.fixture(scope="session")
def w1(w1_config: TargetConfig) -> Iterator[W1HttpxClient]:
    client = W1HttpxClient(w1_config)
    yield client
    client.close()


@pytest.fixture(scope="session")
def require_w1(w1: W1HttpxClient) -> W1HttpxClient:
    """Gate deterministik: target wajib osc_rest milik workspace ini."""
    try:
        probe = w1.get_json(HEALTH_PATH)
    except UnreachableTargetError as exc:
        pytest.skip(f"target osc_rest tidak terjangkau — lewati test live: {exc}")
    if probe.status_code not in (200, 503):
        pytest.skip(
            f"target bukan osc_rest (health HTTP {probe.status_code}) — set "
            "QA_TARGET_BASE_URL; trafik test tidak dikirim ke layanan asing."
        )
    return w1


def _env(name: str) -> str:
    return os.environ.get(name, "")


@pytest.fixture(scope="session")
def local_account() -> Iterator[tuple[str, str]]:
    username = _env("QA_W1_LOCAL_USERNAME")
    password = _env("QA_W1_LOCAL_PASSWORD")
    if not username or not password:
        pytest.skip(
            "QA_W1_LOCAL_USERNAME/QA_W1_LOCAL_PASSWORD tidak diset — "
            "set kredensial akun Local Login untuk test ini."
        )
    yield username, password


@pytest.fixture(scope="session")
def local_access_token(require_w1: W1HttpxClient, local_account: tuple[str, str]) -> Iterator[str]:
    username, password = local_account
    snapshot = login(require_w1, username=username, password=password)
    expectation = LoginExpectation(LoginChannel.LOCAL, (200,), None, None)
    if snapshot.status_code != 200:
        pytest.skip(
            f"login lokal gagal (HTTP {snapshot.status_code}) — akun env mungkin "
            "MFA aktif atau kredensial salah; test ini butuh sesi tanpa MFA."
        )
    del expectation
    data = snapshot.body_json.get("data", {}) if snapshot.body_json else {}
    token = data.get("access_token") if isinstance(data, dict) else None
    if not token:
        pytest.skip("login lokal tidak mengembalikan access_token (mungkin mfa_required)")
    yield str(token)


@pytest.fixture(scope="session")
def mfa_account() -> Iterator[tuple[str, str, str]]:
    username = _env("QA_W1_MFA_USERNAME")
    password = _env("QA_W1_MFA_PASSWORD")
    secret = _env("QA_W1_MFA_SECRET")
    if not (username and password and secret):
        pytest.skip(
            "QA_W1_MFA_USERNAME/PASSWORD/SECRET tidak diset — set akun dengan "
            "MFA aktif (secret base32) untuk test MFA."
        )
    yield username, password, secret


@pytest.fixture(scope="session")
def hris_company() -> Iterator[tuple[str, str, str]]:
    company_id = _env("QA_W1_HRIS_COMPANY_ID")
    username = _env("QA_W1_HRIS_USERNAME")
    password = _env("QA_W1_HRIS_PASSWORD")
    if not (company_id and username and password):
        pytest.skip(
            "QA_W1_HRIS_COMPANY_ID/USERNAME/PASSWORD tidak diset — set perusahaan "
            "dengan hris_login_url menunjuk stub HRIS untuk test dual-mode."
        )
    yield company_id, username, password


@pytest.fixture(scope="session")
def hris_cache_ttl_ok() -> bool:
    return _env("QA_W1_HRIS_CACHE_TTL_OK", "true").lower() in {"1", "true", "yes"}
