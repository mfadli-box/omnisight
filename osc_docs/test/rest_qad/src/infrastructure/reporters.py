"""Reporter bukti (evidence) JSON untuk lampiran laporan debug/regresi."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

DEFAULT_EVIDENCE_DIR = Path("evidence")


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
