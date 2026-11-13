"""Model domain Wave 1 — murni, zero I/O (kontrak: osc_docs/rest/api-w1.md)."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Mapping


class HrisStubMode(str, Enum):
    """Mode stub HRIS ASMX untuk orkestrasi dual-mode login."""

    OK = "ok"  # body "1|..." → sync profil + cache Argon2id
    INVALID = "invalid"  # body "0|...|NONE" → 401 TANPA fallback
    NON_XML = "nonxml"  # body HTML bukan XML → parse gagal
    SLOW = "slow"  # diam melebihi timeout upstream (8 s)


class LoginChannel(str, Enum):
    """Jalur login yang dinilai (bab 5.1–5.2 api-w1)."""

    LOCAL = "local"  # company_id == "" → Argon2id lokal
    HRIS = "hris"  # company hris_enabled + upstream HRIS ASMX


@dataclass(frozen=True)
class CompanyOption:
    """Baris `GET /auth/companies` — hris_login_url TIDAK pernah diekspos."""

    id: str
    name: str
    code: str
    hris_enabled: bool


@dataclass(frozen=True)
class LoginExpectation:
    """Ekspektasi login ternormalisasi untuk satu kombinasi input."""

    channel: LoginChannel
    allowed_status: tuple[int, ...]
    error_code: str | None  # None = sukses
    offline_cache: bool | None  # None = tidak relevan (sukses lokal / MFA)
    hris_synced: bool = False  # `last_hris_sync_at` wajib terisi


@dataclass(frozen=True)
class MenuNode:
    """Node pohon `MenuModule` hasil merge `CompanyMenuPrivilege`."""

    id: str
    title: str
    route_path: str | None
    icon: str | None
    can_view: bool
    can_create: bool
    can_update: bool
    can_delete: bool
    children: tuple["MenuNode", ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class ImportRowError:
    """Satu baris laporan error import Excel (`{row_number, column, code, message}`)."""

    row_number: int
    column: str
    code: str  # REQUIRED|TOO_LONG|ENUM_INVALID|IP_INVALID|NUMBER_INVALID|DUPLICATE
    message: str


@dataclass(frozen=True)
class ImportSummary:
    """Ringkasan `POST /assets/import` (cap 100 baris error)."""

    inserted: int
    error_count: int
    errors: tuple[ImportRowError, ...]


@dataclass(frozen=True)
class AssetRecord:
    """Baris aset ITAM minimal untuk verifikasi export Excel."""

    asset_tag: str
    name: str
    mgmt_ip: str | None = None
    raw_cells: Mapping[str, Any] | None = None  # sel mentah per header (audit sanitasi)
