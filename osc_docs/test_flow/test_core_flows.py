"""Pengujian black-box alur inti pada lingkungan integrasi OmniSight sementara.

Atur variabel sesuai dokumentasi di osc_docs/test_flow/README.md. Secret dibaca
dari environment; kredensial uji tidak disimpan dalam repositori.
"""
from __future__ import annotations

import os
import re
import base64
import hashlib
import hmac
import struct
import time
import zipfile
from io import BytesIO
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

API = os.getenv("OMNISIGHT_TEST_API_URL", "http://127.0.0.1:8080").rstrip("/")
TIMEOUT = float(os.getenv("OMNISIGHT_TEST_TIMEOUT", "10"))


def required(*names: str) -> dict[str, str]:
    values = {name: os.getenv(name, "") for name in names}
    missing = [name for name, value in values.items() if not value]
    if missing:
        message = "integration fixture not configured: " + ", ".join(missing)
        if os.getenv("OMNISIGHT_TEST_REQUIRE_FIXTURES") == "1":
            pytest.fail(message)
        pytest.skip(message)
    return values


def client() -> httpx.Client:
    return httpx.Client(base_url=API, timeout=TIMEOUT, follow_redirects=False)


def payload(response: httpx.Response) -> dict:
    try:
        return response.json()
    except ValueError:
        return {}


def error_code(response: httpx.Response) -> str:
    return payload(response).get("error", {}).get("code", "")


def login(api: httpx.Client, username: str, password: str, company_id: str | None = None, **extra):
    body = {"username": username, "password": password, **extra}
    if company_id:
        body["company_id"] = company_id
    return api.post("/baas/v1/auth/login", json=body)


def session_token(response: httpx.Response) -> str:
    data = payload(response).get("data", {})
    token = data.get("access_token")
    assert response.status_code == 200, payload(response)
    assert token, "expected a completed non-MFA session"
    return token


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def totp(secret: str, timestamp: float | None = None) -> str:
    raw = base64.b32decode(secret.upper() + "=" * ((8 - len(secret) % 8) % 8))
    counter = int((time.time() if timestamp is None else timestamp) // 30)
    digest = hmac.new(raw, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{value:06d}"


def test_local_account_login():
    env = required("OMNISIGHT_TEST_LOCAL_USERNAME", "OMNISIGHT_TEST_LOCAL_PASSWORD")
    with client() as api:
        response = login(api, env["OMNISIGHT_TEST_LOCAL_USERNAME"], env["OMNISIGHT_TEST_LOCAL_PASSWORD"])
    data = payload(response).get("data", {})
    assert response.status_code == 200, payload(response)
    assert data.get("mfa_required") is False
    assert data.get("access_token")


def test_hris_success_auto_provisions_and_syncs_profile():
    env = required("OMNISIGHT_TEST_HRIS_COMPANY_ID", "OMNISIGHT_TEST_HRIS_USERNAME", "OMNISIGHT_TEST_HRIS_PASSWORD", "OMNISIGHT_TEST_FIXTURE_CONTROLLER_URL")
    with httpx.Client(timeout=TIMEOUT) as control, client() as api:
        configured = control.post(env["OMNISIGHT_TEST_FIXTURE_CONTROLLER_URL"].rstrip("/") + "/scenario", json={"scenario": "hris_success", "company_id": env["OMNISIGHT_TEST_HRIS_COMPANY_ID"], "username": env["OMNISIGHT_TEST_HRIS_USERNAME"]})
        assert configured.is_success, "test controller must configure an isolated successful <string>1|... response"
        response = login(api, env["OMNISIGHT_TEST_HRIS_USERNAME"], env["OMNISIGHT_TEST_HRIS_PASSWORD"], env["OMNISIGHT_TEST_HRIS_COMPANY_ID"])
    data = payload(response).get("data", {})
    assert response.status_code == 200, payload(response)
    assert data.get("user", {}).get("username", "").casefold() == env["OMNISIGHT_TEST_HRIS_USERNAME"].casefold()
    assert data.get("access_token") or data.get("mfa_required")
    # Controller mencatat respons XML HRIS; respons API mengonfirmasi profil
    # telah disinkronkan dan dipetakan ke konteks aplikasi yang berhak.


def test_hris_denial_never_falls_back_to_cached_password():
    env = required("OMNISIGHT_TEST_HRIS_COMPANY_ID", "OMNISIGHT_TEST_HRIS_USERNAME", "OMNISIGHT_TEST_HRIS_PASSWORD", "OMNISIGHT_TEST_FIXTURE_CONTROLLER_URL")
    with httpx.Client(timeout=TIMEOUT) as control, client() as api:
        configured = control.post(env["OMNISIGHT_TEST_FIXTURE_CONTROLLER_URL"].rstrip("/") + "/scenario", json={"scenario": "hris_denied", "company_id": env["OMNISIGHT_TEST_HRIS_COMPANY_ID"], "username": env["OMNISIGHT_TEST_HRIS_USERNAME"]})
        assert configured.is_success
        response = login(api, env["OMNISIGHT_TEST_HRIS_USERNAME"], env["OMNISIGHT_TEST_HRIS_PASSWORD"], env["OMNISIGHT_TEST_HRIS_COMPANY_ID"])
    assert response.status_code == 401
    assert error_code(response) == "INVALID_CREDENTIALS"


def test_hris_circuit_offline_cache_accepts_within_ttl_and_rejects_expired():
    env = required("OMNISIGHT_TEST_HRIS_COMPANY_ID", "OMNISIGHT_TEST_HRIS_USERNAME", "OMNISIGHT_TEST_HRIS_PASSWORD", "OMNISIGHT_TEST_HRIS_EXPIRED_USERNAME", "OMNISIGHT_TEST_HRIS_EXPIRED_PASSWORD", "OMNISIGHT_TEST_FIXTURE_CONTROLLER_URL")
    controller = env["OMNISIGHT_TEST_FIXTURE_CONTROLLER_URL"].rstrip("/") + "/scenario"
    with httpx.Client(timeout=TIMEOUT) as control, client() as api:
        configured = control.post(controller, json={"scenario": "hris_timeout", "company_id": env["OMNISIGHT_TEST_HRIS_COMPANY_ID"]})
        assert configured.is_success
        within_ttl = None
        for _ in range(6):  # exercise the configured 5-in-30s breaker threshold
            within_ttl = login(api, env["OMNISIGHT_TEST_HRIS_USERNAME"], env["OMNISIGHT_TEST_HRIS_PASSWORD"], env["OMNISIGHT_TEST_HRIS_COMPANY_ID"])
            time.sleep(0.05)
        assert within_ttl is not None and within_ttl.status_code == 200, payload(within_ttl)
        expired_seed = control.post(controller, json={"scenario": "expire_hris_sync", "company_id": env["OMNISIGHT_TEST_HRIS_COMPANY_ID"], "username": env["OMNISIGHT_TEST_HRIS_EXPIRED_USERNAME"]})
        assert expired_seed.is_success
        expired = login(api, env["OMNISIGHT_TEST_HRIS_EXPIRED_USERNAME"], env["OMNISIGHT_TEST_HRIS_EXPIRED_PASSWORD"], env["OMNISIGHT_TEST_HRIS_COMPANY_ID"])
    assert expired.status_code == 502
    assert error_code(expired) == "HRIS_UPSTREAM_INVALID_RESPONSE"


def test_totp_enable_verify_and_backup_code_recovery_reset():
    env = required("OMNISIGHT_TEST_MFA_USERNAME", "OMNISIGHT_TEST_MFA_PASSWORD", "OMNISIGHT_TEST_FIXTURE_CONTROLLER_URL")
    reset_url = env["OMNISIGHT_TEST_FIXTURE_CONTROLLER_URL"].rstrip("/") + "/scenario"
    reset_fixture = httpx.post(reset_url, json={"scenario": "reset_mfa_enrollment_fixture", "username": env["OMNISIGHT_TEST_MFA_USERNAME"]}, timeout=TIMEOUT)
    assert reset_fixture.is_success
    with client() as api:
        initial = login(api, env["OMNISIGHT_TEST_MFA_USERNAME"], env["OMNISIGHT_TEST_MFA_PASSWORD"])
        token = session_token(initial)
        setup = api.post("/baas/v1/auth/mfa/setup", headers=auth(token))
        assert setup.status_code == 200, payload(setup)
        uri = payload(setup).get("data", {}).get("provisioning_uri", "")
        query = parse_qs(urlparse(uri).query)
        secret = query.get("secret", [None])[0]
        assert secret and urlparse(uri).scheme == "otpauth"
        enabled = api.post("/baas/v1/auth/mfa/enable", headers=auth(token), json={"otp": totp(secret)})
        assert enabled.status_code == 200, payload(enabled)
        codes = payload(enabled).get("data", {}).get("backup_codes", [])
        assert codes, "MFA enable must return one-time recovery codes"
        challenge = login(api, env["OMNISIGHT_TEST_MFA_USERNAME"], env["OMNISIGHT_TEST_MFA_PASSWORD"])
        challenge_data = payload(challenge).get("data", {})
        assert challenge.status_code == 200 and challenge_data.get("mfa_required") is True
        time.sleep(30 - int(time.time()) % 30 + 1)  # enable consumes its TOTP step
        verify = api.post("/baas/v1/auth/mfa/verify", json={"mfa_challenge_token": challenge_data["mfa_challenge_token"], "otp": totp(secret)})
        assert session_token(verify)
        recovered = login(api, env["OMNISIGHT_TEST_MFA_USERNAME"], env["OMNISIGHT_TEST_MFA_PASSWORD"], backup_code=codes[0])
        assert recovered.status_code == 200 and payload(recovered).get("data", {}).get("access_token")
        assert payload(recovered).get("data", {}).get("mfa_required") is False
        reused = login(api, env["OMNISIGHT_TEST_MFA_USERNAME"], env["OMNISIGHT_TEST_MFA_PASSWORD"], backup_code=codes[0])
    assert reused.status_code == 401


def test_company_and_area_switcher_and_navigation():
    env = required("OMNISIGHT_TEST_SWITCH_USERNAME", "OMNISIGHT_TEST_SWITCH_PASSWORD", "OMNISIGHT_TEST_TARGET_COMPANY_ID", "OMNISIGHT_TEST_TARGET_AREA_ID")
    with client() as api:
        token = session_token(login(api, env["OMNISIGHT_TEST_SWITCH_USERNAME"], env["OMNISIGHT_TEST_SWITCH_PASSWORD"]))
        switched = api.post("/baas/v1/auth/switch-company", headers=auth(token), json={"company_id": env["OMNISIGHT_TEST_TARGET_COMPANY_ID"], "area_id": env["OMNISIGHT_TEST_TARGET_AREA_ID"]})
        assert switched.status_code == 200, payload(switched)
        next_token = payload(switched).get("data", {}).get("access_token")
        assert next_token
        navigation = api.get("/baas/v1/me/navigation", headers=auth(next_token))
    assert navigation.status_code == 200, payload(navigation)
    modules = {item.get("module_code") for item in payload(navigation).get("data", [])}
    assert modules and all(re.fullmatch(r"[A-Z]{2}\d{2}", module or "") for module in modules)


def test_sop_upload_download_round_trip():
    env = required("OMNISIGHT_TEST_KB_USERNAME", "OMNISIGHT_TEST_KB_PASSWORD", "OMNISIGHT_TEST_SOP_DOCUMENT_ID")
    content = b"OmniSight integration SOP attachment\n"
    with client() as api:
        token = session_token(login(api, env["OMNISIGHT_TEST_KB_USERNAME"], env["OMNISIGHT_TEST_KB_PASSWORD"]))
        path = f"/baas/v1/sop/documents/{env['OMNISIGHT_TEST_SOP_DOCUMENT_ID']}/attachment"
        uploaded = api.post(path, headers={**auth(token), "Content-Type": "text/plain"}, content=content)
        assert uploaded.status_code == 200, payload(uploaded)
        downloaded = api.get(path, headers=auth(token))
    assert downloaded.status_code == 200
    assert downloaded.content == content


def test_excel_and_pdf_outputs_have_valid_file_structures():
    env = required("OMNISIGHT_TEST_REPORT_USERNAME", "OMNISIGHT_TEST_REPORT_PASSWORD")
    table = os.getenv("OMNISIGHT_TEST_REPORT_TABLE", "osc_activity_log")
    with client() as api:
        token = session_token(login(api, env["OMNISIGHT_TEST_REPORT_USERNAME"], env["OMNISIGHT_TEST_REPORT_PASSWORD"]))
        headers = auth(token)
        excel = api.get(f"/baas/v1/reports/export-excel/{table}", headers=headers)
        pdf = api.post("/baas/v1/reports/generate-pdf", headers=headers, json={"table_name": table})
    assert excel.status_code == 200 and excel.content.startswith(b"PK\x03\x04")
    with zipfile.ZipFile(BytesIO(excel.content)) as workbook:
        members = set(workbook.namelist())
        assert "[Content_Types].xml" in members and "xl/workbook.xml" in members and "xl/worksheets/sheet1.xml" in members
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF-") and pdf.content.rstrip().endswith(b"%%EOF")
