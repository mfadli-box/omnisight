"""infrastructure/ — adapter teknis QA suite.

ATURAN: di sinilah httpx/OS/env dipakai; mengimplementasikan port
domain/ dan dikonsumsi test/ lewat fixture conftest.
"""

from infrastructure.config import TargetConfig
from infrastructure.http_client import HttpxApiClient, snapshot_from_httpx_response
from infrastructure.reporters import JsonEvidenceReporter

__all__ = [
    "HttpxApiClient",
    "JsonEvidenceReporter",
    "TargetConfig",
    "snapshot_from_httpx_response",
]
