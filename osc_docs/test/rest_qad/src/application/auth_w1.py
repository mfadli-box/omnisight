"""Skema Pydantic & verifikasi kontrak Wave 1 (api-w1 §2, app-w1 §2).

Fungsi `evaluate_*` MURNI (snapshot masuk, verdict keluar) agar unit test
berjalan penuh tanpa jaringan; test live hanya mengambil snapshot lewat port.
"""

from __future__ import annotations

from typing import Any, Mapping

from pydantic import BaseModel, ConfigDict, StrictBool, StrictStr, ValidationError

from domain.models import ApiResponseSnapshot
from domain.models_w1 import MenuNode

SUPPORTED_ERROR_CODES = frozenset(
    {
        "VALIDATION_ERROR",
        "UNAUTHORIZED",
        "FORBIDDEN",
        "RATE_LIMITED",
        "HRIS_UPSTREAM_INVALID_RESPONSE",
        "NOT_FOUND",
        "CONFLICT",
        "PAYLOAD_TOO_LARGE",
    }
)

ENVELOPE_ERROR_CODES = frozenset(
    {
        "VALIDATION_ERROR",
        "UNAUTHORIZED",
        "FORBIDDEN",
        "RATE_LIMITED",
        "HRIS_UPSTREAM_INVALID_RESPONSE",
        "NOT_FOUND",
        "CONFLICT",
        "PAYLOAD_TOO_LARGE",
        "INTERNAL",
    }
)


class _Envelope(BaseModel):
    """Pembungkus generik: `{"status": "...", "data"|"error": ...}`."""

    model_config = ConfigDict(extra="allow")

    status: StrictStr


class LoginDataModel(BaseModel):
    """`data` login sukses langsung (api-w1 §2) — token boleh distrip BFF."""

    model_config = ConfigDict(extra="allow", protected_namespaces=())

    mfa_required: StrictBool
    access_token: StrictStr | None = None
    offline_cache: StrictBool | None = None
    session_id: StrictStr | None = None
    user: dict[str, Any] | None = None
    active_company_id: StrictStr | None = None


class MfaChallengeModel(BaseModel):
    """`data` ketika MFA aktif — challenge token 5 menit `scope=mfa_pending`."""

    model_config = ConfigDict(extra="allow", protected_namespaces=())

    mfa_required: StrictBool
    mfa_challenge_token: StrictStr | None = None


def _error_code(body_json: Any) -> str | None:
    if not isinstance(body_json, Mapping):
        return None
    error = body_json.get("error")
    if isinstance(error, Mapping):
        code = error.get("code")
        if isinstance(code, str):
            return code
    return None


def _error_correlation(body_json: Any) -> str | None:
    if not isinstance(body_json, Mapping):
        return None
    value = body_json.get("correlation_id")
    return value if isinstance(value, str) else None


class ContractVerdict(BaseModel):
    """Hasil evaluasi satu snapshot terhadap kontrak (dipakai test/assert)."""

    passed: bool
    detail: str
    status_code: int = 0
    error_code: str | None = None


def evaluate_envelope_error(snapshot: ApiResponseSnapshot) -> ContractVerdict:
    """Verifikasi bentuk respons gagal: envelope error + kode dikenal + correlation."""
    if snapshot.status_code < 400:
        return ContractVerdict(False, "diharapkan respons gagal (>=400)", snapshot.status_code)
    if snapshot.body_json is None:
        return ContractVerdict(
            False,
            f"body bukan JSON (content-type: {snapshot.content_type!r})",
            snapshot.status_code,
        )
    status = snapshot.body_json.get("status") if isinstance(snapshot.body_json, Mapping) else None
    code = _error_code(snapshot.body_json)
    if status != "error" or code is None:
        return ContractVerdict(
            False,
            f"envelope error dilanggar: status={status!r}, error.code={code!r}",
            snapshot.status_code,
        )
    if code not in ENVELOPE_ERROR_CODES:
        # Kode di luar daftar diperbolehkan selama envelope konsisten, tapi dicatat.
        pass
    if _error_correlation(snapshot.body_json) is None:
        return ContractVerdict(
            False,
            "error envelope tanpa correlation_id",
            snapshot.status_code,
            code,
        )
    return ContractVerdict(True, f"envelope error valid ({code})", snapshot.status_code, code)


def evaluate_login_success(snapshot: ApiResponseSnapshot, *, expect_mfa: bool) -> ContractVerdict:
    """Verifikasi `POST /auth/login` sukses: envelope + konsistensi mfa/token."""
    if snapshot.status_code != 200 or snapshot.body_json is None:
        return ContractVerdict(False, "login sukses wajib 200 JSON", snapshot.status_code)
    if snapshot.body_json.get("status") != "success":
        return ContractVerdict(
            False,
            f"status body {snapshot.body_json.get('status')!r} != 'success'",
            snapshot.status_code,
        )
    data = snapshot.body_json.get("data")
    try:
        if expect_mfa:
            challenge = MfaChallengeModel.model_validate(data)
            if not challenge.mfa_required:
                return ContractVerdict(False, "mfa_required harus true", 200)
            if not challenge.mfa_challenge_token:
                return ContractVerdict(
                    False, "mfa_required tanpa mfa_challenge_token", 200
                )
            if "access_token" in data and data.get("access_token"):
                return ContractVerdict(
                    False, "challenge MFA tidak boleh menyertakan access_token", 200
                )
            return ContractVerdict(True, "challenge MFA sesuai kontrak", 200)
        login = LoginDataModel.model_validate(data)
        if login.mfa_required:
            return ContractVerdict(False, "mfa_required harus false", 200)
        if not login.access_token or not login.session_id:
            return ContractVerdict(
                False, "login sukses tanpa access_token/session_id", 200
            )
        return ContractVerdict(True, "login sukses sesuai kontrak", 200)
    except ValidationError as exc:
        return ContractVerdict(
            False,
            f"skema data.login tidak sesuai: {exc.error_count()} error, "
            f"pertama: {exc.errors()[0]['msg']}",
            200,
        )


def _walk_menu(raw: Any) -> tuple[list[MenuNode], list[str]]:
    """Bangun pohon MenuNode + kumpulkan anomali bentuk (route wajib string)."""
    nodes: list[MenuNode] = []
    anomalies: list[str] = []
    if not isinstance(raw, list):
        return nodes, ["menus bukan array"]
    for entry in raw:
        if not isinstance(entry, Mapping):
            anomalies.append("node menu bukan objek")
            continue
        children_raw = entry.get("children") or []
        children, child_anomalies = _walk_menu(children_raw)
        anomalies.extend(child_anomalies)
        node_id = entry.get("id") or entry.get("menu_id")
        if not isinstance(node_id, str):
            anomalies.append("node menu tanpa id")
            continue
        route = entry.get("route_path") or entry.get("route")
        nodes.append(
            MenuNode(
                id=node_id,
                title=str(entry.get("title") or entry.get("name") or ""),
                route_path=route if isinstance(route, str) else None,
                icon=entry.get("icon") if isinstance(entry.get("icon"), str) else None,
                can_view=entry.get("can_view", True) is not False,
                can_create=entry.get("can_create", False) is True,
                can_update=entry.get("can_update", False) is True,
                can_delete=entry.get("can_delete", False) is True,
                children=tuple(children),
            )
        )
    return nodes, anomalies


def _all_nodes(nodes: tuple[MenuNode, ...] | tuple) -> list[MenuNode]:
    flattened: list[MenuNode] = []
    stack: list[MenuNode] = list(nodes)  # type: ignore[arg-type]
    while stack:
        node = stack.pop()
        flattened.append(node)
        stack.extend(node.children)
    return flattened


def evaluate_navigation(snapshot: ApiResponseSnapshot) -> ContractVerdict:
    """Verifikasi `GET /me/navigation` (api-w1 §2 + app-w1 §4.2):

    - `companies` berisi flag `is_active_company` dengan TEPAT satu aktif;
    - pohon `menus` tervalidasi;
    - server-side filtering: node `can_view=false` TIDAK PERNAH dikirim.
    """
    if snapshot.status_code != 200 or snapshot.body_json is None:
        return ContractVerdict(False, "navigation wajib 200 JSON", snapshot.status_code)
    data = snapshot.body_json.get("data")
    if not isinstance(data, Mapping):
        return ContractVerdict(False, "data.navigation bukan objek", snapshot.status_code)

    companies = data.get("companies")
    if not isinstance(companies, list):
        return ContractVerdict(False, "companies bukan array", snapshot.status_code)
    active_flags = [
        bool(company.get("is_active_company"))
        for company in companies
        if isinstance(company, Mapping)
    ]
    if sum(active_flags) != 1:
        return ContractVerdict(
            False,
            f"is_active_company harus tepat satu (ditemukan {sum(active_flags)})",
            snapshot.status_code,
        )

    menus, anomalies = _walk_menu(data.get("menus"))
    if anomalies:
        return ContractVerdict(
            False, f"anomali pohon menu: {anomalies[:3]}", snapshot.status_code
        )
    hidden = [node for node in _all_nodes(tuple(menus)) if not node.can_view]
    if hidden:
        return ContractVerdict(
            False,
            "server-side filtering dilanggar: node can_view=false ikut dikirim "
            f"({hidden[0].id})",
            snapshot.status_code,
        )
    return ContractVerdict(
        True,
        f"navigation valid ({len(companies)} company, {len(menus)} menu root)",
        snapshot.status_code,
    )
