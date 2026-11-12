"""Redaksi bukti & reporter JSON — secret TIDAK PERNAH masuk file evidence."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

#: Header yang nilainya WAJIB direduksi sebelum disimpan.
SENSITIVE_HEADER_KEYS = frozenset(
    {"authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key"}
)
REDACTED = "<redacted>"
DEFAULT_EVIDENCE_DIR = Path("evidence")


def redact_headers(headers: Mapping[str, str]) -> dict[str, str]:
    """Salin header dengan nilai sensitif diganti ``<redacted>``."""
    return {
        key: (REDACTED if key.lower() in SENSITIVE_HEADER_KEYS else value)
        for key, value in headers.items()
    }


class JsonEvidenceReporter:
    """Tulis evidence terstruktur ke ``<directory>/<name>.json``."""

    def __init__(self, directory: Path | str = DEFAULT_EVIDENCE_DIR) -> None:
        self._directory = Path(directory)

    def write(self, name: str, payload: Mapping[str, Any]) -> Path:
        self._directory.mkdir(parents=True, exist_ok=True)
        path = self._directory / f"{name}.json"
        document = {
            "written_at": datetime.now(timezone.utc).isoformat(),
            "payload": dict(payload),
        }
        path.write_text(
            json.dumps(document, indent=2, ensure_ascii=False, default=str),
            encoding="utf-8",
        )
        return path
