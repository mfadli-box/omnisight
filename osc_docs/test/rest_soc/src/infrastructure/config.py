"""Konfigurasi target SOC + Rules of Engagement — dari environment.

Variabel:
- ``SOC_TARGET_BASE_URL``          default ``http://127.0.0.1:8000``
- ``SOC_TARGET_TOKEN``             default kosong (health masih public)
- ``SOC_TARGET_TIMEOUT_SECONDS``   default ``10`` (rentang 1..120)
- ``SOC_MAX_REQUESTS_PER_TEST``    default ``20`` (rentang 1..200) — anti flood
- ``SOC_ALLOW_ACTIVE_ATTACKS``     default ``false`` — vektor aktif (fuzz
  massal/brute) DILARANG kecuali diaktifkan eksplisit pada target milik
  Anda sendiri (staging/local).
"""

from __future__ import annotations

import os

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class SocTargetConfig(BaseModel):
    """Target osc_rest + batas Rules of Engagement (immutable)."""

    model_config = ConfigDict(frozen=True)

    base_url: HttpUrl
    token: str = ""
    timeout_seconds: float = Field(default=10.0, ge=1.0, le=120.0)
    max_requests_per_test: int = Field(default=20, ge=1, le=200)
    allow_active_attacks: bool = False

    @classmethod
    def from_env(cls) -> "SocTargetConfig":
        env = os.environ.get
        return cls(
            base_url=env("SOC_TARGET_BASE_URL", "http://127.0.0.1:8000"),
            token=env("SOC_TARGET_TOKEN", ""),
            timeout_seconds=float(env("SOC_TARGET_TIMEOUT_SECONDS", "10")),
            max_requests_per_test=int(env("SOC_MAX_REQUESTS_PER_TEST", "20")),
            allow_active_attacks=env("SOC_ALLOW_ACTIVE_ATTACKS", "false").lower()
            in {"1", "true", "yes"},
        )
