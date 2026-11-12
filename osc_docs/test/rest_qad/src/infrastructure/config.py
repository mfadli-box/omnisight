"""Konfigurasi target QA — dari environment, ZERO hardcoded secret.

Variabel:
- ``QA_TARGET_BASE_URL``          default ``http://127.0.0.1:8000``
- ``QA_TARGET_TOKEN``             default kosong (health masih public)
- ``QA_TARGET_TIMEOUT_SECONDS``   default ``10`` (rentang 1..120)
"""

from __future__ import annotations

import os

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class TargetConfig(BaseModel):
    """Target osc_rest untuk suite QA (immutable setelah dibaca)."""

    model_config = ConfigDict(frozen=True)

    base_url: HttpUrl
    token: str = ""
    timeout_seconds: float = Field(default=10.0, ge=1.0, le=120.0)

    @classmethod
    def from_env(cls) -> "TargetConfig":
        env = os.environ.get
        return cls(
            base_url=env("QA_TARGET_BASE_URL", "http://127.0.0.1:8000"),
            token=env("QA_TARGET_TOKEN", ""),
            timeout_seconds=float(env("QA_TARGET_TIMEOUT_SECONDS", "10")),
        )
