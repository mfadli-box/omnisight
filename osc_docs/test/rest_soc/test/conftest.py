"""Fixture pytest bersama SOC suite.

Target & Rules of Engagement dibaca dari environment (zero hardcoded
secret). Test live skip (bukan fail) bila osc_rest tidak hidup — CI tanpa
stack tetap hijau; jalankan stack untuk audit penuh.
"""

from __future__ import annotations

from typing import Iterator

import pytest

from domain.errors import UnreachableTargetError
from infrastructure.config import SocTargetConfig
from infrastructure.security_client import HttpxSecurityClient


@pytest.fixture(scope="session")
def soc_config() -> SocTargetConfig:
    return SocTargetConfig.from_env()


@pytest.fixture(scope="session")
def soc_client(soc_config: SocTargetConfig) -> Iterator[HttpxSecurityClient]:
    client = HttpxSecurityClient(soc_config)
    yield client
    client.close()


@pytest.fixture(scope="session")
def require_target(soc_client: HttpxSecurityClient) -> HttpxSecurityClient:
    """Gate deterministik: verifikasi target BENAR-BENAR osc_rest kita.

    Kontrak health public osc_rest: 200 (ok) / 503 (degraded) ber-JSON
    health. Bila port dijawab entitas lain (reverse proxy, aplikasi lain,
    dsb.) → SKIP: vektor audit TIDAK PERNAH dikirim ke layanan yang bukan
    milik workspace ini (aturan Rules of Engagement).
    """
    try:
        probe = soc_client.send("GET", "/api/v1/health")
    except UnreachableTargetError as exc:
        pytest.skip(f"target osc_rest tidak terjangkau — lewati audit live: {exc}")
    if probe.status_code not in (200, 503):
        pytest.skip(
            f"target bukan osc_rest (health menjawab HTTP {probe.status_code}, "
            "bukan 200/503) — set SOC_TARGET_BASE_URL ke instance osc_rest yang "
            "benar; vektor audit tidak dikirim ke layanan asing."
        )
    return soc_client
