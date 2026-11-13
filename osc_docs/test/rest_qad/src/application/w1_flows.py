"""Use case orkestrasi alur Wave 1 — bergantung HANYA pada port domain.

Test `test/` memanggil fungsi-fungsi ini dengan adapter infrastruktur;
tidak ada import httpx di layer ini.
"""

from __future__ import annotations

import json
from typing import Any, Mapping

from application.totp import totp_code
from domain.errors import ContractViolationError
from domain.gateways_w1 import W1ApiClient
from domain.models import ApiResponseSnapshot

API = "/api/v1"


def _data(snapshot: ApiResponseSnapshot, *, what: str) -> Mapping[str, Any]:
    if snapshot.body_json is None or not isinstance(snapshot.body_json, Mapping):
        raise ContractViolationError(f"{what}: body bukan JSON envelope")
    data = snapshot.body_json.get("data")
    if not isinstance(data, Mapping):
        raise ContractViolationError(f"{what}: envelope tanpa objek data")
    return data


def login(
    client: W1ApiClient,
    *,
    username: str,
    password: str,
    company_id: str = "",
) -> ApiResponseSnapshot:
    """`POST /auth/login` — company_id kosong berarti Local Login."""
    return client.post_json(
        f"{API}/auth/login",
        {"company_id": company_id, "username": username, "password": password},
    )


def mfa_verify_with_otp(
    client: W1ApiClient, *, challenge_token: str, secret: str, step_offset: int = 0
) -> ApiResponseSnapshot:
    """Step-2 login: `POST /auth/mfa/verify` dengan Bearer `scope=mfa_pending`."""
    return client.post_json(
        f"{API}/auth/mfa/verify",
        {"otp": totp_code(secret, step_offset=step_offset)},
        token=challenge_token,
    )


def mfa_verify_with_backup_code(
    client: W1ApiClient, *, challenge_token: str, backup_code: str
) -> ApiResponseSnapshot:
    return client.post_json(
        f"{API}/auth/mfa/verify",
        {"backup_code": backup_code},
        token=challenge_token,
    )


def mfa_setup_and_enable(client: W1ApiClient, *, access_token: str) -> tuple[ApiResponseSnapshot, ApiResponseSnapshot]:
    """Siklus setup → enable (QR + 10 backup code, lalu OTP aktif)."""
    setup = client.post_json(f"{API}/auth/mfa/setup", {}, token=access_token)
    if setup.status_code != 200:
        return setup, setup
    data = _data(setup, what="mfa/setup")
    otpauth_uri = str(data.get("otpauth_uri") or "")
    if not otpauth_uri:
        raise ContractViolationError("mfa/setup: otpauth_uri tidak ada")
    from application.totp import secret_from_otpauth_uri  # lokal: hindari siklus modul

    enable = client.post_json(
        f"{API}/auth/mfa/enable",
        {"otp": totp_code(secret_from_otpauth_uri(otpauth_uri))},
        token=access_token,
    )
    return setup, enable


def switch_company(client: W1ApiClient, *, access_token: str, company_id: str) -> ApiResponseSnapshot:
    return client.post_json(
        f"{API}/auth/switch-company", {"company_id": company_id}, token=access_token
    )


def navigation(client: W1ApiClient, *, access_token: str) -> ApiResponseSnapshot:
    return client.get_json(f"{API}/me/navigation", token=access_token)


def checkout_asset(
    client: W1ApiClient, *, access_token: str, asset_id: str, assignee: str
) -> ApiResponseSnapshot:
    return client.post_json(
        f"{API}/assets/{asset_id}/checkout",
        {"assignee": assignee, "expected_checkin": None},
        token=access_token,
    )


def checkin_asset(client: W1ApiClient, *, access_token: str, asset_id: str) -> ApiResponseSnapshot:
    return client.post_json(f"{API}/assets/{asset_id}/checkin", {}, token=access_token)


def import_assets(
    client: W1ApiClient, *, access_token: str, workbook: bytes, filename: str = "qa-w1-assets.xlsx"
) -> ApiResponseSnapshot:
    return client.post_multipart(
        f"{API}/assets/import",
        field="file",
        filename=filename,
        content=workbook,
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        token=access_token,
    )


def export_assets(client: W1ApiClient, *, access_token: str) -> ApiResponseSnapshot:
    return client.get_binary(f"{API}/assets/export", token=access_token)


def parse_import_summary(snapshot: ApiResponseSnapshot) -> dict[str, Any]:
    """Ambil `{inserted, error_count, errors}` dari respons import."""
    data = dict(_data(snapshot, what="assets/import"))
    return {
        "inserted": int(data.get("inserted", 0)),
        "error_count": int(data.get("error_count", 0)),
        "errors": list(data.get("errors") or []),
    }


def filter_query(collection: str, filter_ast: Mapping[str, Any]) -> str:
    """Bentuk `?filter=...` (URL-encoded) untuk `GET /items/{collection}`."""
    from urllib.parse import quote

    return f"{API}/items/{collection}?filter={quote(json.dumps(filter_ast, separators=(',', ':')))}"
