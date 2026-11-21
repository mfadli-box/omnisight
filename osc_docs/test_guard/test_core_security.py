"""Pemeriksaan keamanan inti terhadap stack OmniSight yang berjalan.

Cakupan: penolakan rute terlindungi tanpa cookie/JWT, penolakan otorisasi PAM
untuk principal tanpa MFA aktif, validasi SSRF pada konfigurasi konektor HRIS,
serta regresi parser HRIS untuk memastikan DTD ditolak sebelum resolusi entitas.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import uuid
from pathlib import Path

import httpx
import pytest

API = os.getenv("OMNISIGHT_TEST_API_URL", "http://127.0.0.1:36664").rstrip("/")
TIMEOUT = float(os.getenv("OMNISIGHT_TEST_TIMEOUT", "20"))


def required(*names: str) -> dict[str, str]:
    values = {name: os.getenv(name, "") for name in names}
    missing = [name for name, value in values.items() if not value]
    if missing:
        message = "fixture keamanan belum dikonfigurasi: " + ", ".join(missing)
        if os.getenv("OMNISIGHT_TEST_REQUIRE_FIXTURES") == "1":
            pytest.fail(message)
        pytest.skip(message)
    return values


def client() -> httpx.Client:
    return httpx.Client(base_url=API, timeout=TIMEOUT, follow_redirects=False)


def body(response: httpx.Response) -> dict:
    try:
        return response.json()
    except ValueError:
        return {}


def error_code(response: httpx.Response) -> str:
    return body(response).get("error", {}).get("code", "")


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def login(api: httpx.Client, username: str, password: str, company_id: str | None = None):
    payload = {"username": username, "password": password}
    if company_id:
        payload["company_id"] = company_id
    return api.post("/baas/v1/auth/login", json=payload)


def token_of(response: httpx.Response) -> str:
    assert response.status_code == 200, (response.status_code, error_code(response))
    data = body(response)["data"]
    assert data["mfa_required"] is False, "fixture memerlukan akun uji tanpa MFA"
    assert data.get("access_token"), "respons autentikasi tidak menyediakan access token"
    return data["access_token"]


def admin_credentials() -> dict[str, str]:
    return required(
        "OMNISIGHT_TEST_ADMIN_USERNAME",
        "OMNISIGHT_TEST_ADMIN_PASSWORD",
    )


def active_context(api: httpx.Client, token: str, company_id: str) -> dict:
    response = api.get("/baas/v1/me/contexts", headers=auth(token))
    assert response.status_code == 200, body(response)
    context = next((item for item in body(response)["data"] if item["id"] == company_id), None)
    assert context, "konteks company akun uji tidak tersedia"
    return context


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("GET", "/baas/v1/me/navigation", None),
        ("GET", "/baas/v1/me/contexts", None),
        ("GET", "/baas/v1/sop/documents", None),
        ("GET", "/baas/v1/audit-logs", None),
        ("GET", "/baas/v1/reports/export-excel/osc_activity_log", None),
        (
            "POST",
            "/baas/v1/sop/documents",
            {"document_code": "UNAUTH", "title": "UNAUTH"},
        ),
        (
            "POST",
            "/baas/v1/pam/sessions/authorize",
            {"target_id": str(uuid.uuid4()), "reason": "unauthorized"},
        ),
    ],
)
def test_protected_routes_reject_missing_or_malformed_credentials(method, path, payload):
    with client() as api:
        for headers in (
            {},
            {"Authorization": "Bearer not-a-valid-jwt"},
            {"Cookie": "omnisight_session=not-a-valid-jwt"},
        ):
            request_kwargs = {"json": payload} if payload is not None else {}
            response = api.request(method, path, headers=headers, **request_kwargs)
            assert response.status_code == 401, (headers, response.status_code, body(response))
            assert error_code(response) == "INVALID_CHALLENGE", body(response)


def test_pam_authorization_requires_active_mfa():
    prefix = "OMNISIGHT_TEST_PAM_NO_MFA"
    if os.getenv(f"{prefix}_USERNAME"):
        credentials = required(f"{prefix}_USERNAME", f"{prefix}_PASSWORD")
        username = credentials[f"{prefix}_USERNAME"]
        password = credentials[f"{prefix}_PASSWORD"]
        company_id = os.getenv(f"{prefix}_COMPANY_ID") or None
    else:
        credentials = admin_credentials()
        username = credentials["OMNISIGHT_TEST_ADMIN_USERNAME"]
        password = credentials["OMNISIGHT_TEST_ADMIN_PASSWORD"]
        company_id = None

    with client() as api:
        signed_in = login(api, username, password, company_id)
        token = token_of(signed_in)
        principal = body(signed_in)["data"]["user"]
        context = active_context(api, token, principal["company_id"])
        area_ids = {area["id"] for area in context["areas"]}
        assert area_ids, "fixture PAM perlu area aktif"
        area_id = principal["area_id"] or context["areas"][0]["id"]

        target_id = os.getenv("OMNISIGHT_TEST_PAM_TARGET_ID")
        targets = api.get(
            f"/baas/v1/pam/targets/{target_id}" if target_id else "/baas/v1/pam/targets",
            headers=auth(token),
            params=None if target_id else {"limit": 200},
        )
        assert targets.status_code == 200, body(targets)
        target_data = body(targets)["data"]
        candidates = [target_data] if target_id else target_data
        target = next(
            (
                item
                for item in candidates
                if item["is_active"] and item["area_id"] in area_ids
            ),
            None,
        )
        if target_id:
            assert target, "target PAM fixture harus aktif dan berada dalam cakupan akun"
        if target is None:
            created = api.post(
                "/baas/v1/pam/targets",
                headers=auth(token),
                json={
                    "target_code": f"SEC-{uuid.uuid4().hex}",
                    "display_name": "Security guard PAM target",
                    "hostname": "pam-smoke.invalid",
                    "port": 22,
                    "protocol": "SSH",
                    "area_id": area_id,
                },
            )
            assert created.status_code == 201, body(created)
            target = body(created)["data"]

        authorized = api.post(
            "/baas/v1/pam/sessions/authorize",
            headers=auth(token),
            json={
                "target_id": target["id"],
                "reason": "security regression test without MFA",
            },
        )
    assert authorized.status_code == 403, body(authorized)
    assert error_code(authorized) == "MFA_REQUIRED_FOR_PAM", body(authorized)
    assert "session_id" not in body(authorized).get("data", {})


INVALID_HRIS_TEMPLATES = {
    "ipv4_literal": "https://192.0.2.1/login?u={U}&p={P}",
    "ipv6_literal": "https://[2001:db8::1]/login?u={U}&p={P}",
    "host_outside_allowlist": "https://hris-smoke.invalid/login?u={U}&p={P}",
    "missing_placeholders": "https://hris-smoke.invalid/login",
}


def test_hris_connector_rejects_ssrf_and_malformed_templates():
    credentials = admin_credentials()
    with client() as api:
        signed_in = login(
            api,
            credentials["OMNISIGHT_TEST_ADMIN_USERNAME"],
            credentials["OMNISIGHT_TEST_ADMIN_PASSWORD"],
        )
        token = token_of(signed_in)
        company_id = body(signed_in)["data"]["user"]["company_id"]
        for case, template in INVALID_HRIS_TEMPLATES.items():
            response = api.patch(
                f"/baas/v1/companies/{company_id}/connector",
                headers=auth(token),
                json={
                    "auth_provider": "HRIS_ASMX",
                    "hris_login_url": template,
                    "hris_cache_ttl_hours": 72,
                },
            )
            assert response.status_code == 400, (case, response.status_code, body(response))
            assert error_code(response) == "INVALID_INPUT", (case, body(response))


def test_hris_parser_rejects_dtd_and_oversized_xml():
    """Jalankan regresi parser produksi dengan XML biasa, DTD kosong, dan ukuran berlebih."""
    cargo = shutil.which("cargo")
    if cargo is None:
        message = "Cargo diperlukan untuk menjalankan regresi parser HRIS"
        if os.getenv("OMNISIGHT_TEST_REQUIRE_FIXTURES") == "1":
            pytest.fail(message)
        pytest.skip(message)
    manifest = Path(__file__).resolve().parents[2] / "osc_rest" / "Cargo.toml"
    test_name = "infrastructure::hris::tests::parses_success_and_denial_and_rejects_dtd_and_oversize_xml"
    result = subprocess.run(
        [cargo, "test", "--locked", "--manifest-path", str(manifest), "--lib", test_name, "--", "--exact"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert f"test {test_name} ... ok" in result.stdout, result.stdout
