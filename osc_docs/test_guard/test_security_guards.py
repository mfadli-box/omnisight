"""Pemeriksaan regresi keamanan black-box pada deployment uji sementara."""
from __future__ import annotations

import os
import base64
import hashlib
import hmac
import struct
import time

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


def api_client() -> httpx.Client:
    return httpx.Client(base_url=API, timeout=TIMEOUT, follow_redirects=False)


def body(response: httpx.Response) -> dict:
    try:
        return response.json()
    except ValueError:
        return {}


def code(response: httpx.Response) -> str:
    return body(response).get("error", {}).get("code", "")


def totp(secret: str, timestamp: float | None = None) -> str:
    raw = base64.b32decode(secret.upper() + "=" * ((8 - len(secret) % 8) % 8))
    counter = int((time.time() if timestamp is None else timestamp) // 30)
    digest = hmac.new(raw, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{value:06d}"


def login(api: httpx.Client, username: str, password: str, company_id: str | None = None):
    request = {"username": username, "password": password}
    if company_id:
        request["company_id"] = company_id
    return api.post("/baas/v1/auth/login", json=request)


def token_of(response: httpx.Response) -> str:
    data = body(response).get("data", {})
    assert response.status_code == 200, body(response)
    assert data.get("access_token") and not data.get("mfa_required")
    return data["access_token"]


def control(scenario: str, **fields):
    url = os.getenv("OMNISIGHT_TEST_FIXTURE_CONTROLLER_URL", "").rstrip("/")
    if not url:
        message = "integration fixture not configured: OMNISIGHT_TEST_FIXTURE_CONTROLLER_URL"
        if os.getenv("OMNISIGHT_TEST_REQUIRE_FIXTURES") == "1":
            pytest.fail(message)
        pytest.skip(message)
    response = httpx.post(url + "/scenario", json={"scenario": scenario, **fields}, timeout=TIMEOUT)
    assert response.is_success, "isolated HRIS test controller failed to configure scenario"


@pytest.mark.parametrize("scenario", ["ssrf_private_ip", "ssrf_cloud_metadata"])
def test_hris_ssrf_internal_and_metadata_hosts_are_rejected(scenario: str):
    env = required("OMNISIGHT_TEST_HRIS_COMPANY_ID", "OMNISIGHT_TEST_HRIS_USERNAME", "OMNISIGHT_TEST_HRIS_PASSWORD")
    control(scenario, company_id=env["OMNISIGHT_TEST_HRIS_COMPANY_ID"])
    with api_client() as api:
        response = login(api, env["OMNISIGHT_TEST_HRIS_USERNAME"], env["OMNISIGHT_TEST_HRIS_PASSWORD"], env["OMNISIGHT_TEST_HRIS_COMPANY_ID"])
    assert response.status_code == 502
    assert code(response) == "HRIS_UPSTREAM_INVALID_RESPONSE"


@pytest.mark.parametrize("scenario", ["hris_xxe", "hris_oversized_xml"])
def test_hris_parser_rejects_xxe_and_xml_over_64k(scenario: str):
    env = required("OMNISIGHT_TEST_HRIS_COMPANY_ID", "OMNISIGHT_TEST_HRIS_USERNAME", "OMNISIGHT_TEST_HRIS_PASSWORD")
    control(scenario, company_id=env["OMNISIGHT_TEST_HRIS_COMPANY_ID"])
    with api_client() as api:
        response = login(api, env["OMNISIGHT_TEST_HRIS_USERNAME"], env["OMNISIGHT_TEST_HRIS_PASSWORD"], env["OMNISIGHT_TEST_HRIS_COMPANY_ID"])
    assert response.status_code == 502
    assert code(response) == "HRIS_UPSTREAM_INVALID_RESPONSE"


def test_totp_replay_and_five_attempt_rate_limit():
    env = required("OMNISIGHT_TEST_MFA_ENABLED_USERNAME", "OMNISIGHT_TEST_MFA_ENABLED_PASSWORD", "OMNISIGHT_TEST_TOTP_SECRET", "OMNISIGHT_TEST_FIXTURE_CONTROLLER_URL")
    control("reset_mfa_replay_fixture", username=env["OMNISIGHT_TEST_MFA_ENABLED_USERNAME"])
    with api_client() as api:
        challenge = login(api, env["OMNISIGHT_TEST_MFA_ENABLED_USERNAME"], env["OMNISIGHT_TEST_MFA_ENABLED_PASSWORD"])
        challenge_data = body(challenge).get("data", {})
        assert challenge.status_code == 200 and challenge_data.get("mfa_required")
        time.sleep(30 - int(time.time()) % 30 + 1)
        post = lambda otp: api.post("/baas/v1/auth/mfa/verify", json={"mfa_challenge_token": challenge_data["mfa_challenge_token"], "otp": otp})
        first = post(totp(env["OMNISIGHT_TEST_TOTP_SECRET"]))
        assert first.status_code == 200, body(first)
        # Terbitkan ulang challenge login dengan memakai kembali kode langkah waktu saat ini.
        replay_challenge = login(api, env["OMNISIGHT_TEST_MFA_ENABLED_USERNAME"], env["OMNISIGHT_TEST_MFA_ENABLED_PASSWORD"])
        replay_data = body(replay_challenge).get("data", {})
        replay = api.post("/baas/v1/auth/mfa/verify", json={"mfa_challenge_token": replay_data["mfa_challenge_token"], "otp": totp(env["OMNISIGHT_TEST_TOTP_SECRET"])})
        assert replay.status_code == 409 and code(replay) == "TOTP_REPLAY"
        # Gunakan akun terisolasi lain untuk brute force karena kegagalan replay
        # menambah counter pembatas laju pengguna yang sama.
        env2 = required("OMNISIGHT_TEST_MFA_BRUTE_USERNAME", "OMNISIGHT_TEST_MFA_BRUTE_PASSWORD", "OMNISIGHT_TEST_MFA_BRUTE_TOTP_SECRET")
        brute_challenge = login(api, env2["OMNISIGHT_TEST_MFA_BRUTE_USERNAME"], env2["OMNISIGHT_TEST_MFA_BRUTE_PASSWORD"])
        brute_data = body(brute_challenge).get("data", {})
        assert brute_challenge.status_code == 200 and brute_data.get("mfa_required")
        valid_codes = {totp(env2["OMNISIGHT_TEST_MFA_BRUTE_TOTP_SECRET"], time.time() + offset * 30) for offset in range(-3, 4)}
        invalid_code = next(f"{candidate:06d}" for candidate in range(1_000_000) if f"{candidate:06d}" not in valid_codes)
        outcomes = [api.post("/baas/v1/auth/mfa/verify", json={"mfa_challenge_token": brute_data["mfa_challenge_token"], "otp": invalid_code}) for _ in range(6)]
    assert all(r.status_code == 401 for r in outcomes[:5])
    assert outcomes[-1].status_code == 429 and code(outcomes[-1]) == "MFA_RATE_LIMITED"


@pytest.mark.parametrize("fixture_prefix", ["OMNISIGHT_TEST_PAM_NO_MFA", "OMNISIGHT_TEST_PAM_STALE_MFA"])
def test_pam_requires_mfa_and_recent_step_up(fixture_prefix: str):
    names = [f"{fixture_prefix}_USERNAME", f"{fixture_prefix}_PASSWORD", "OMNISIGHT_TEST_PAM_TARGET_ID"]
    if fixture_prefix.endswith("STALE_MFA"):
        names.append("OMNISIGHT_TEST_PAM_STALE_MFA_TOTP_SECRET")
        names.append("OMNISIGHT_TEST_FIXTURE_CONTROLLER_URL")
    env = required(*names)
    with api_client() as api:
        signed_in = login(api, env[f"{fixture_prefix}_USERNAME"], env[f"{fixture_prefix}_PASSWORD"])
        signed_data = body(signed_in).get("data", {})
        if signed_data.get("mfa_required"):
            otp_secret = env.get("OMNISIGHT_TEST_PAM_STALE_MFA_TOTP_SECRET")
            assert otp_secret, "MFA-enabled PAM fixture requires its protected TOTP seed"
            verified = api.post("/baas/v1/auth/mfa/verify", json={"mfa_challenge_token": signed_data["mfa_challenge_token"], "otp": totp(otp_secret)})
            signed_in = verified
        elif fixture_prefix.endswith("STALE_MFA"):
            pytest.fail("stale PAM fixture must have MFA enabled")
        token = token_of(signed_in)
        if fixture_prefix.endswith("STALE_MFA"):
            control("age_mfa_verification", username=env[f"{fixture_prefix}_USERNAME"])
        response = api.post("/baas/v1/pam/sessions/authorize", headers={"Authorization": f"Bearer {token}"}, json={"target_id": os.environ["OMNISIGHT_TEST_PAM_TARGET_ID"], "reason": "security regression test"})
    assert response.status_code == 403
    expected = "MFA_REQUIRED_FOR_PAM" if fixture_prefix.endswith("NO_MFA") else "MFA_STEP_UP_REQUIRED"
    assert code(response) == expected


def test_cross_tenant_and_cross_area_ids_are_not_authorized():
    env = required("OMNISIGHT_TEST_IDOR_USERNAME", "OMNISIGHT_TEST_IDOR_PASSWORD", "OMNISIGHT_TEST_OTHER_COMPANY_ID", "OMNISIGHT_TEST_OTHER_AREA_ID", "OMNISIGHT_TEST_OTHER_SOP_DOCUMENT_ID")
    with api_client() as api:
        token = token_of(login(api, env["OMNISIGHT_TEST_IDOR_USERNAME"], env["OMNISIGHT_TEST_IDOR_PASSWORD"]))
        headers = {"Authorization": f"Bearer {token}"}
        tenant_switch = api.post("/baas/v1/auth/switch-company", headers=headers, json={"company_id": env["OMNISIGHT_TEST_OTHER_COMPANY_ID"], "area_id": env["OMNISIGHT_TEST_OTHER_AREA_ID"]})
        doc_path = f"/baas/v1/sop/documents/{env['OMNISIGHT_TEST_OTHER_SOP_DOCUMENT_ID']}/attachment"
        cross_tenant_document = api.get(doc_path, headers=headers)
    assert tenant_switch.status_code == 403
    assert cross_tenant_document.status_code in (403, 404)


def test_cross_area_document_idor_is_not_authorized():
    env = required("OMNISIGHT_TEST_AREA_IDOR_USERNAME", "OMNISIGHT_TEST_AREA_IDOR_PASSWORD", "OMNISIGHT_TEST_SAME_COMPANY_OTHER_AREA_DOCUMENT_ID")
    with api_client() as api:
        token = token_of(login(api, env["OMNISIGHT_TEST_AREA_IDOR_USERNAME"], env["OMNISIGHT_TEST_AREA_IDOR_PASSWORD"]))
        area_response = api.get(f"/baas/v1/sop/documents/{env['OMNISIGHT_TEST_SAME_COMPANY_OTHER_AREA_DOCUMENT_ID']}/attachment", headers={"Authorization": f"Bearer {token}"})
    assert area_response.status_code in (403, 404)
