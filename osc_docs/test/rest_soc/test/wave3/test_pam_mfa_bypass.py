"""SOC-W3 Mandatory MFA PAM & step-up 15 menit — Broken Auth (API2:2023, CWE-308/294).

Kontrak api-w3 §2 (`POST /pam/sessions/authorize`):
- langkah 3: `user.mfa_enabled == false` → `403 MFA_REQUIRED_FOR_PAM` TANPA
  kecuali (super admin pun ditolak) — menyediakan OTP TIDAK boleh menyelamatkan
  (gate #3 mendahului verifikasi OTP #7);
- langkah 6: usia verifikasi MFA `(now_step − last_step) × 30 s` > window
  policy (default 15 menit) → wajib `otp`; kosong → `403 PAM_STEP_UP_REQUIRED`;
- langkah 7: OTP anti-replay (step ≤ tersimpan ditolak → 401).
"""

from __future__ import annotations

import pytest

from application.w1_vectors import totp_code
from application.w3_vectors import otp_rescue_attempts, secret_leak_scan
from infrastructure.w2_soc_client import data_of, error_code, json_body
from infrastructure.w3_soc_client import PAM_SESSIONS

pytestmark = [
    pytest.mark.soc,
    pytest.mark.auth_bypass,
    pytest.mark.pam,
    pytest.mark.wave3,
]

AUTHORIZE = "/api/v1/pam/sessions/authorize"


def _authorize_payload(account_id: str, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "account_id": account_id,
        "reason": "SOC-W3 audit penetrasi mandatory MFA",
        "duration_minutes": 60,
    }
    payload.update(overrides)
    return payload


def test_nomfa_user_authorize_rejected(soc_w3, nomfa_token, pam_account_id, vault_canaries):
    """SOC-W3-001 — user `mfa_enabled == false` authorize → 403 MFA_REQUIRED_FOR_PAM."""
    evidence = soc_w3.authorize_session(
        _authorize_payload(pam_account_id), token=nomfa_token
    )
    assert evidence.status_code == 403, (
        f"authorize TANPA MFA diterima (HTTP {evidence.status_code}) — mandatory "
        "MFA PAM BISA di-bypass: kritis (bab 5.3, api-w3 §2)."
    )
    assert error_code(evidence) == "MFA_REQUIRED_FOR_PAM", (
        f"kode error {error_code(evidence)!r} ≠ MFA_REQUIRED_FOR_PAM — sinyal "
        "penolakan harus eksplisit untuk log SOC."
    )
    assert not secret_leak_scan(evidence.body_excerpt, vault_canaries), (
        "respons penolakan membocorkan marker kredensial"
    )


@pytest.mark.parametrize(
    "label,payload_extra", [t for t in otp_rescue_attempts()], ids=lambda l: l
)
def test_nomfa_user_with_otp_still_rejected(
    soc_w3, nomfa_token, pam_account_id, label, payload_extra
):
    """SOC-W3-002 — user tanpa MFA menyelundupkan `otp` → TETAP 403 MFA_REQUIRED_FOR_PAM.

    Gate mfa_enabled (#3) WAJIB mendahului verifikasi OTP (#7); kalau OTP
    "menyelamatkan" request, urutan gate bisa diputar untuk bypass.
    """
    evidence = soc_w3.authorize_session(
        _authorize_payload(pam_account_id, **payload_extra), token=nomfa_token
    )
    assert evidence.status_code in (400, 403), (
        f"otp rescue {label!r} mengubah penolakan (HTTP {evidence.status_code}) — "
        "urutan gate bisa diputar"
    )
    if evidence.status_code == 403:
        assert error_code(evidence) == "MFA_REQUIRED_FOR_PAM"


def test_superadmin_without_mfa_also_rejected(
    soc_w3, nomfa_superadmin_token, pam_account_id
):
    """SOC-W3-003 — penolakan TANPA KECUALI: super admin tanpa MFA → 403 sama."""
    evidence = soc_w3.authorize_session(
        _authorize_payload(pam_account_id), token=nomfa_superadmin_token
    )
    assert evidence.status_code == 403, (
        f"super admin tanpa MFA lolos (HTTP {evidence.status_code}) — ada "
        "pengecualian role terlarang (bab 5.3)"
    )
    assert error_code(evidence) == "MFA_REQUIRED_FOR_PAM"


def test_denial_recorded_in_audit_trail_without_ticket(
    soc_w3, nomfa_token, pam_account_id, vault_canaries
):
    """SOC-W3-004 — penolakan tercatat `pam_session_logs` DENIED + tanpa ticket/hash."""
    denied = soc_w3.authorize_session(
        _authorize_payload(pam_account_id), token=nomfa_token
    )
    assert denied.status_code == 403
    listing = soc_w3.get_json(PAM_SESSIONS, token=nomfa_token)
    if listing.status_code != 200:
        pytest.skip(f"listing sesi tidak tersedia (HTTP {listing.status_code})")
    body = json_body(listing) or {}
    text = listing.body_excerpt
    assert "denied" in text.lower(), "penolakan tidak terlihat di audit trail sesi"
    assert not secret_leak_scan(text, vault_canaries), "audit trail membocorkan kredensial"
    assert "ticket" not in body and "ws_ticket_hash" not in text


def test_fresh_mfa_user_authorizes_without_otp(
    soc_w3, pam_fresh_token, pam_account_id, vault_canaries
):
    """SOC-W3-005 — kontrol positif: MFA segar → 201 + ticket hex-256-bit + TTL clamp."""
    evidence = soc_w3.authorize_session(
        _authorize_payload(pam_account_id), token=pam_fresh_token
    )
    assert evidence.status_code == 201, (
        f"authorize sah gagal (HTTP {evidence.status_code}) — akun/policy QA? "
        f"{evidence.body_excerpt[:160]!r}"
    )
    data = data_of(evidence)
    ticket = str(data.get("ticket", ""))
    assert len(ticket) == 64 and all(c in "0123456789abcdef" for c in ticket), (
        "ticket bukan 256-bit hex — entropi ephemeral tidak sesuai kontrak"
    )
    ttl = int(data.get("ticket_ttl_seconds", 0))
    assert 0 < ttl <= 600, f"TTL ticket di luar clamp 30–600 s: {ttl}"
    assert "ticket" not in evidence.response_headers, "ticket bocor ke header"
    assert not secret_leak_scan(evidence.body_excerpt, vault_canaries), (
        "respons authorize membocorkan kredensial vault"
    )
    policy = data.get("policy") or {}
    assert "command_filter" in policy, "policy tanpa command_filter — ACL tidak terkirim ke gateway"


def test_stale_step_up_without_otp_rejected(
    soc_w3, pam_stale_token, pam_account_id, vault_canaries
):
    """SOC-W3-006 — login backup-code (step 0 → usia ≫ 15 menit) tanpa otp → 403 PAM_STEP_UP_REQUIRED."""
    evidence = soc_w3.authorize_session(
        _authorize_payload(pam_account_id), token=pam_stale_token
    )
    assert evidence.status_code == 403, (
        f"step-up kedaluwarsa tidak ditegakkan (HTTP {evidence.status_code}) — "
        "verifikasi MFA lama dipakai otorisasi baru (CWE-613)"
    )
    assert error_code(evidence) == "PAM_STEP_UP_REQUIRED", (
        f"kode error {error_code(evidence)!r} ≠ PAM_STEP_UP_REQUIRED"
    )
    assert not secret_leak_scan(evidence.body_excerpt, vault_canaries)


def test_stale_step_up_with_valid_otp_recovers(
    soc_w3, pam_stale_token, pam_account_id, vault_canaries
):
    """SOC-W3-007 — step-up kedaluwarsa + OTP valid → 201 (alur pemulihan kontrak)."""
    secret = __import__("os").environ.get("SOC_W3_PAM_MFA_SECRET", "")
    if not secret:
        pytest.skip("SOC_W3_PAM_MFA_SECRET tidak diset — OTP valid tidak bisa dihitung")
    evidence = soc_w3.authorize_session(
        _authorize_payload(pam_account_id, otp=totp_code(secret)), token=pam_stale_token
    )
    assert evidence.status_code == 201, (
        f"pemulihan step-up dengan OTP valid gagal (HTTP {evidence.status_code})"
    )
    assert not secret_leak_scan(evidence.body_excerpt, vault_canaries)


@pytest.mark.parametrize(
    "label,payload_extra", [("otp_empty", {"otp": ""}), ("otp_absent", {})], ids=lambda l: l
)
def test_stale_step_up_missing_otp_requires_stepup(
    soc_w3, pam_stale_token, pam_account_id, label, payload_extra
):
    """SOC-W3-008 — step-up kedaluwarsa + otp kosong/tiada → 403 PAM_STEP_UP_REQUIRED."""
    evidence = soc_w3.authorize_session(
        _authorize_payload(pam_account_id, **payload_extra), token=pam_stale_token
    )
    assert evidence.status_code == 403, (
        f"authorize tanpa OTP saat step-up kedaluwarsa diterima (HTTP "
        f"{evidence.status_code}) — window 15 menit tidak ditegakkan"
    )
    assert error_code(evidence) == "PAM_STEP_UP_REQUIRED"


def test_otp_replay_second_use_rejected(
    soc_w3, pam_stale_token, pam_account_id
):
    """SOC-W3-009 — OTP SAMA dipakai dua authorize → kedua berakhir 401 (anti-replay).

    Pemakaian pertama (dengan kode cadangan → step-up kedaluwarsa) memakai kode
    TOTP kini; authorize kedua dengan kode yang sama harus ditolak karena
    `mfa_last_verified_step` sudah maju (step ≤ tersimpan ditolak).
    """
    secret = __import__("os").environ.get("SOC_W3_PAM_MFA_SECRET", "")
    if not secret:
        pytest.skip("SOC_W3_PAM_MFA_SECRET tidak diset — OTP tidak bisa dihitung")
    code = totp_code(secret)
    first = soc_w3.authorize_session(
        _authorize_payload(pam_account_id, otp=code), token=pam_stale_token
    )
    assert first.status_code == 201, (
        f"pemakaian OTP pertama gagal (HTTP {first.status_code}) — skenario replay tidak terbangun"
    )
    replay = soc_w3.authorize_session(
        _authorize_payload(pam_account_id, otp=code), token=pam_stale_token
    )
    assert replay.status_code == 401, (
        f"OTP replay diterima (HTTP {replay.status_code}) — anti-replay step tidak bekerja"
    )
    assert error_code(replay) == "UNAUTHORIZED"


def test_otp_lockout_after_five_failures(
    soc_w3, pam_stale_token, pam_account_id
):
    """SOC-W3-010 — 5 kegagalan OTP → lockout: OTP valid ke-6 → 429 RATE_LIMITED.

    GATED: set ``SOC_W3_ALLOW_LOCKOUT=1`` (mengunci akun PAM QA 15 menit —
    jalankan terakhir / akun khusus). Kode salah deterministik: TOTP step −10
    (di luar toleransi ±1).
    """
    if __import__("os").environ.get("SOC_W3_ALLOW_LOCKOUT", "").lower() not in {"1", "true"}:
        pytest.skip("SOC_W3_ALLOW_LOCKOUT tidak aktif — uji lockout dilewati (RoE)")
    secret = __import__("os").environ.get("SOC_W3_PAM_MFA_SECRET", "")
    if not secret:
        pytest.skip("SOC_W3_PAM_MFA_SECRET tidak diset")
    import time as _time

    stale_code = totp_code(secret, at_unix=_time.time() - 10 * 30)  # step −10
    statuses: list[int] = []
    for _ in range(5):
        bad = soc_w3.authorize_session(
            _authorize_payload(pam_account_id, otp=stale_code), token=pam_stale_token
        )
        statuses.append(bad.status_code)
    assert all(s == 401 for s in statuses), f"kegagalan OTP tidak konsisten 401: {statuses}"
    final = soc_w3.authorize_session(
        _authorize_payload(pam_account_id, otp=totp_code(secret)), token=pam_stale_token
    )
    assert final.status_code == 429, (
        f"OTP valid diterima setelah 5 kegagalan (HTTP {final.status_code}) — "
        "lockout 5 gagal/15 menit TIDAK aktif (brute-force OTP mungkin)"
    )
    assert error_code(final) == "RATE_LIMITED"
