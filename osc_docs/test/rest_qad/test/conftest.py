"""Fixture pytest bersama QA suite.

Target dibaca dari environment (zero hardcoded secret). Test live melewati
dirinya sendiri (skip, bukan fail) bila osc_rest tidak hidup — sehingga
`pytest` tetap hijau di CI tanpa stack; jalankan stack untuk test penuh.
"""

from __future__ import annotations

from typing import Iterator

import pytest

from domain.errors import UnreachableTargetError
from infrastructure.config import TargetConfig
from infrastructure.http_client import HttpxApiClient


@pytest.fixture(scope="session")
def target_config() -> TargetConfig:
    return TargetConfig.from_env()


@pytest.fixture(scope="session")
def api_client(target_config: TargetConfig) -> Iterator[HttpxApiClient]:
    client = HttpxApiClient(target_config)
    yield client
    client.close()


@pytest.fixture(scope="session")
def require_target(api_client: HttpxApiClient) -> HttpxApiClient:
    """Gate deterministik: verifikasi target BENAR-BENAR osc_rest kita.

    Kontrak health public osc_rest: 200 (ok) / 503 (degraded) ber-JSON
    health. Bila port dijawab entitas lain (reverse proxy, aplikasi lain,
    dsb.) → SKIP dengan pesan jelas: trafik test TIDAK PERNAH dikirim ke
    layanan yang bukan milik workspace ini.
    """
    try:
        probe = api_client.get("/api/v1/health")
    except UnreachableTargetError as exc:
        pytest.skip(f"target osc_rest tidak terjangkau — lewati test live: {exc}")
    if probe.status_code not in (200, 503):
        pytest.skip(
            f"target bukan osc_rest (health menjawab HTTP {probe.status_code}, "
            "bukan 200/503) — set QA_TARGET_BASE_URL ke instance osc_rest yang "
            "benar; trafik test tidak dikirim ke layanan asing."
        )
    return api_client
