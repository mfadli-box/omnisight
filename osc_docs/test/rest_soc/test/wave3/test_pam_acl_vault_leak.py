"""SOC-W3 Command ACL Evasion (`pam_bastion_gateway`) & isolasi vault.

Dua sisi serangan (api-w3 §1.1, §4):
1. **ACL evasion** — baris perintah berbahaya menyamar melewati command filter
   gateway (strip ANSI/kontrol, unwrap sudo/env + basename, deny menang).
   Karena ACL dievaluasi di agent Go (WS→SSH), API-side diuji:
   (a) `policy.command_filter` terkirim UTUH pada respons authorize, dan
   (b) evaluator REFERENSI (`application/w3_vectors.evaluate_command`) —
   spesifikasi executable ACL — menangkap semua vektor evasion (unit test).
2. **Vault isolation** — TIDAK ADA respons API (authorize/sesi/rekaman/error)
   yang membocorkan plaintext kredensial vault; plaintext hanya boleh mengalir
   SEKALI pada redeem internal gateway yang sah.
"""

from __future__ import annotations

import gzip

import pytest

from application.w3_vectors import (
    acl_evasion_vectors,
    evaluate_command,
    recording_magic_forgeries,
    secret_leak_scan,
    tampered_tickets,
)
from infrastructure.w2_soc_client import data_of, error_code
from infrastructure.w3_soc_client import PAM_SESSIONS, W3SecurityClient

pytestmark = [
    pytest.mark.soc,
    pytest.mark.pam,
    pytest.mark.idor,
    pytest.mark.wave3,
]

AUTHORIZE = "/api/v1/pam/sessions/authorize"
REDEEM = "/api/v1/agents/pam/ticket/redeem"


@pytest.fixture(scope="module")
def authorized(soc_w3, pam_fresh_token, pam_account_id):
    """Authorize sah sekali per modul — sumber `command_filter` & sesi aktif."""
    evidence = soc_w3.authorize_session(
        {"account_id": pam_account_id, "reason": "SOC-W3 audit ACL & vault", "duration_minutes": 30},
        token=pam_fresh_token,
    )
    assert evidence.status_code == 201, (
        f"authorize awal gagal (HTTP {evidence.status_code}) — env akun/policy QA?"
    )
    return {"evidence": evidence, "data": data_of(evidence)}


@pytest.fixture(scope="module")
def active_session(soc_w3, authorized, gateway_credential):
    """Sesi ACTIVE (sudah redeem) — prasyarat upload rekaman sah."""
    data = authorized["data"]
    agent_id, secret = gateway_credential
    redeemed = soc_w3.post_agent(
        REDEEM,
        {"session_id": data["session_id"], "ticket": data["ticket"]},
        agent_id=agent_id,
        secret=secret,
    )
    if redeemed.status_code != 200:
        pytest.skip(f"redeem untuk sesi rekaman gagal (HTTP {redeemed.status_code})")
    return data["session_id"]


# --- 1. Command filter terkirim utuh + referensi evaluator menangkap evasion --

def test_command_filter_delivered_intact(authorized):
    """SOC-W3-030 — `policy.command_filter` (deny/confirm/allow) ada & utuh di respons."""
    policy = authorized["data"].get("policy") or {}
    command_filter = policy.get("command_filter")
    assert isinstance(command_filter, dict), (
        f"command_filter hilang/bukan objek: {command_filter!r} — gateway tidak "
        "bisa menegakkan ACL"
    )
    for key in ("deny", "confirm", "allow"):
        assert key in command_filter, f"command_filter tanpa '{key}' — kontrak dilanggar"


def test_reference_acl_catches_all_evasion_vectors():
    """SOC-W3-031 — evaluator referensi: SEMUA vektor evasion → DENY (spesifikasi ACL)."""
    for label, command in acl_evasion_vectors():
        decision = evaluate_command(command, deny=("re:cat", "/etc/shadow", "re:base64", "re:\\bbash\\b", "re:xargs"))
        assert decision == "DENY", (
            f"vektor evasion {label!r} lolos evaluator referensi ({command!r} → "
            f"{decision}) — gateway dengan kontrak ini bisa dievase"
        )


def test_reference_acl_deny_wins_over_allow():
    """SOC-W3-032 — deny menang atas allow: `cat /etc/shadow` tetap ditolak."""
    decision = evaluate_command(
        "cat /etc/shadow", deny=("/etc/shadow",), allow=("cat",)
    )
    assert decision == "DENY", "allow menimpa deny — urutan evaluasi ACL salah"
    assert evaluate_command("cat /etc/hostname", deny=("/etc/shadow",), allow=("cat",)) == "ALLOW"


def test_reference_acl_confirm_is_deny_by_default():
    """SOC-W3-033 — aturan confirm (workflow W4) = deny-by-default."""
    decision = evaluate_command(
        "sudo reboot -f", deny=(), confirm=("re:reboot",), allow=()
    )
    assert decision == "CONFIRM", "aturan confirm tidak terpicu"
    # Gateway W4: CONFIRM dievaluasi DENY (tidak ada jalur persetujuan dulu).


def test_reference_acl_malformed_regex_fails_closed():
    """SOC-W3-034 — regex malformed → fail-safe DENY (bukan crash/bypass)."""
    assert evaluate_command("ls", deny=("re:[unclosed",)) == "DENY"
    assert evaluate_command("ls", allow=("re:[unclosed",)) == "DENY"  # allowlist gagal-tutup


def test_reference_acl_strips_ansi_and_control_before_match():
    """SOC-W3-035 — ANSI/control di-lucuti SEBELUM pencocokan (anti smuggle)."""
    cleaned = "\x1b[32mcat\x1b[0m\x00 /etc/shadow"
    assert evaluate_command(cleaned, deny=("re:cat",)) == "DENY"
    from application.w3_vectors import strip_ansi_and_control

    assert "\x1b" not in strip_ansi_and_control(cleaned)
    assert "\x00" not in strip_ansi_and_control(cleaned)


# --- 2. Vault isolation: zero secret leakage pada seluruh permukaan API -------

def test_authorize_response_never_leaks_vault_secret(authorized, vault_canaries):
    """SOC-W3-036 — respons authorize: tanpa plaintext/ciphertext/blob/marker secret."""
    evidence = authorized["evidence"]
    leaks = secret_leak_scan(evidence.body_excerpt, vault_canaries)
    assert not leaks, f"respons authorize membocorkan kredensial: marker {leaks}"
    leaks_headers = secret_leak_scan(str(dict(evidence.response_headers)), vault_canaries)
    assert not leaks_headers, "header respons membocorkan kredensial"
    account = authorized["data"].get("account") or {}
    assert "secret" not in account and "secret_encrypted" not in account, (
        "objek `account` pada authorize membawa kredensial"
    )


def test_session_listing_and_detail_leak_nothing(soc_w3, authorized, pam_fresh_token, vault_canaries):
    """SOC-W3-037 — GET /pam/sessions{,/{id}}: tanpa ticket/hash/secret — hanya pointer."""
    listing = soc_w3.get_json(PAM_SESSIONS, token=pam_fresh_token)
    assert listing.status_code == 200, f"listing sesi gagal (HTTP {listing.status_code})"
    assert not secret_leak_scan(listing.body_excerpt, vault_canaries), (
        "listing sesi membocorkan marker kredensial"
    )
    session_id = authorized["data"]["session_id"]
    detail = soc_w3.get_json(f"{PAM_SESSIONS}/{session_id}", token=pam_fresh_token)
    if detail.status_code == 200:
        assert not secret_leak_scan(detail.body_excerpt, vault_canaries), (
            "detail sesi membocorkan kredensial"
        )
        assert '"ticket"' not in detail.body_excerpt and "ws_ticket_hash" not in detail.body_excerpt


@pytest.mark.parametrize(
    "label,account_id",
    [
        ("zero_uuid", "00000000-0000-0000-0000-000000000000"),
        ("malformed", "not-a-uuid"),
        ("uuid_traversal", "../../etc/passwd"),
    ],
    ids=lambda l: l,
)
def test_authorize_probing_foreign_or_malformed_account(
    soc_w3, pam_fresh_token, label, account_id, vault_canaries
):
    """SOC-W3-038 — probing account_id asing/malformed → 400/404 rapi, zero leak.

    UUID nol tidak milik tenant manapun → 404/400; TIDAK BOLEH 5xx atau
    membocorkan label/username akun tenant lain (anti IDOR, api-w3 §1).
    """
    evidence = soc_w3.authorize_session(
        {"account_id": account_id, "reason": "SOC-W3 probing IDOR"}, token=pam_fresh_token
    )
    assert evidence.status_code in (400, 404), (
        f"probing {label!r} → HTTP {evidence.status_code} (harus 400/404, tanpa 5xx)"
    )
    assert not secret_leak_scan(evidence.body_excerpt, vault_canaries)
    from application.w2_vectors import no_internal_leak

    assert no_internal_leak(evidence.body_excerpt)


# --- 3. Kanal rekaman: magic-byte forgery + metadata pointer-only --------------

@pytest.mark.parametrize("label,body", recording_magic_forgeries(), ids=lambda l: l)
def test_recording_magic_byte_forgery_rejected(
    soc_w3, active_session, gateway_credential, label, body, vault_canaries
):
    """SOC-W3-039 — body menyamar format rekaman → 400/413, zero leak.

    Magic bytes divalidasi server-side (gzip `1F 8B` / MP4 `ftyp` @4) — bukan
    sekadar extension; kalau text/ZIP lolos sebagai CAST_GZ, rekaman bisa
    dipalsukan (immutable audit rusak).
    """
    agent_id, secret = gateway_credential
    evidence = soc_w3.upload_recording(active_session, body, agent_id=agent_id, secret=secret)
    assert evidence.status_code in (400, 413, 415), (
        f"magic-byte forgery {label!r} diterima (HTTP {evidence.status_code}) — "
        "validasi format rekaman tidak ketat"
    )
    assert not secret_leak_scan(evidence.body_excerpt, vault_canaries)


def test_recording_upload_pointer_only_metadata(
    soc_w3, active_session, gateway_credential, vault_canaries
):
    """SOC-W3-040 — upload CAST_GZ sah → 201 metadata pointer; key aman; zero secret."""
    agent_id, secret = gateway_credential
    payload = gzip.compress(b"[0, 1700000000.0, \"ls\", \"payload\"]\n" * 8)
    evidence = soc_w3.upload_recording(
        active_session, payload, agent_id=agent_id, secret=secret, query="format=CAST_GZ"
    )
    if evidence.status_code != 201:
        pytest.skip(
            f"upload sah tidak 201 (HTTP {evidence.status_code}) — bucket/env "
            "RustFS staging belum siap; kontrol positif dilewati"
        )
    data = data_of(evidence)
    object_key = str(data.get("object_key", ""))
    assert object_key.startswith("pam/") and ".." not in object_key, (
        f"object key tidak aman: {object_key!r} (harus pam/{{company}}/{{session}}/…)"
    )
    assert active_session in object_key, "object key tidak terikat sesi"
    assert data.get("sha256") and len(str(data["sha256"])) == 64
    assert not secret_leak_scan(evidence.body_excerpt, vault_canaries), (
        "respons upload rekaman membocorkan kredensial"
    )


def test_redeem_error_paths_leak_nothing(soc_w3, active_session, gateway_credential, vault_canaries):
    """SOC-W3-041 — error redeem (ticket tampered) tanpa kredensial target."""
    agent_id, secret = gateway_credential
    evidence = soc_w3.post_agent(
        REDEEM,
        {"session_id": active_session, "ticket": tampered_tickets("a" * 64)[0][1]},
        agent_id=agent_id,
        secret=secret,
    )
    assert evidence.status_code in (400, 401, 409)
    assert not secret_leak_scan(evidence.body_excerpt, vault_canaries), (
        "error redeem membocorkan kredensial target"
    )
