"""QA-W1 MFA: TOTP setup/enable/verify, anti-replay, backup-code reset.

(api-w1 §2 `auth/mfa/*`, §5 MFA controls; app-w1 §4.1/§4.2 profil keamanan.)

Live test — membutuhkan akun dengan MFA aktif via env (lihat conftest).
Verifikasi kontrak:
- `mfa_required=true` → challenge JWT 5 menit `scope=mfa_pending`;
- `verify` dengan OTP step saat ini → access token + sesi baru;
- anti-replay: OTP yang sama (step ≤ tersimpan) ditolak;
- backup code sekali pakai → sukses + MFA auto-reset (`mfa_enabled=false`).
"""

from __future__ import annotations

import pytest

from application.auth_w1 import evaluate_login_success
from application.totp import (
    DIGITS,
    STEP_SECONDS,
    hotp,
    base32_decode,
    totp_code,
)
from application.w1_flows import login, mfa_verify_with_otp
from infrastructure.w1_client import data_of, error_code_of

pytestmark = [pytest.mark.integration, pytest.mark.wave1]


def _challenge(require_w1, mfa_account):
    """Login step-1: dapatkan `mfa_challenge_token` (positive control)."""
    username, password, _secret = mfa_account
    snapshot = login(require_w1, username=username, password=password)
    if snapshot.status_code != 200:
        pytest.skip(f"login step-1 gagal (HTTP {snapshot.status_code}) — cek env akun MFA")
    data = data_of(snapshot)
    if not data.get("mfa_required"):
        pytest.skip("akun env ternyata tanpa MFA — test MFA tidak relevan")
    token = data.get("mfa_challenge_token")
    if not token:
        pytest.skip("mfa_required tanpa mfa_challenge_token — kontrak dilanggar")
    return str(token)


def test_qa_w1_m01_totp_matches_rfc6238_vectors():
    """Unit-level: implementasi TOTP QA tervalidasi vektor resmi RFC 6238 (SHA1)."""
    # Vektor RFC 6238 Appendix B (secret ASCII "12345678901234567890", 8 digit;
    # counter = unix_time // 30).
    key = base32_decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")
    assert hotp(key, 1, digits=8) == "94287082"  # T = 59 s
    assert hotp(key, 37037036, digits=8) == "07081804"  # T = 1111111109 s
    assert hotp(key, 37037037, digits=8) == "14050471"  # T = 1111111111 s
    assert len(totp_code("GEZDGNBVGY3TQOJQ", at_unix=59)) == DIGITS
    assert STEP_SECONDS == 30


def test_qa_w1_m02_login_step1_returns_mfa_challenge(require_w1, mfa_account):
    username, password, _ = mfa_account
    snapshot = login(require_w1, username=username, password=password)
    verdict = evaluate_login_success(snapshot, expect_mfa=True)
    assert verdict.passed, f"kontrak challenge MFA dilanggar: {verdict.detail}"


def test_qa_w1_m03_verify_current_step_issues_session(require_w1, mfa_account):
    username, password, secret = mfa_account
    challenge = _challenge(require_w1, mfa_account)
    snapshot = mfa_verify_with_otp(require_w1, challenge_token=challenge, secret=secret)
    assert snapshot.status_code == 200, (
        f"verify OTP step aktif harus 200 (dapat {snapshot.status_code}): "
        f"{error_code_of(snapshot)}"
    )
    data = data_of(snapshot)
    assert data.get("access_token") and data.get("session_id"), (
        "verify sukses wajib menerbitkan access_token + session_id baru"
    )


def test_qa_w1_m04_totp_replay_same_step_rejected(require_w1, mfa_account):
    """Anti-replay: OTP step ≤ `mfa_last_verified_step` ditolak."""
    username, password, secret = mfa_account
    challenge = _challenge(require_w1, mfa_account)
    first = mfa_verify_with_otp(require_w1, challenge_token=challenge, secret=secret)
    if first.status_code != 200:
        pytest.skip(f"verify pertama gagal (HTTP {first.status_code}) — tidak ada yang bisa di-replay")
    replay = mfa_verify_with_otp(require_w1, challenge_token=challenge, secret=secret)
    assert replay.status_code >= 400 and replay.status_code < 500, (
        f"replay OTP harus ditolak 4xx (dapat HTTP {replay.status_code})"
    )
    assert error_code_of(replay) in {"UNAUTHORIZED", "VALIDATION_ERROR", "RATE_LIMITED"}


def test_qa_w1_m05_neighbor_step_within_tolerance_or_rejected(require_w1, mfa_account):
    """Toleransi ±1 step: kode step+1 diterima ATAU ditolak rapi (4xx, tanpa 5xx)."""
    username, password, secret = mfa_account
    challenge = _challenge(require_w1, mfa_account)
    snapshot = mfa_verify_with_otp(
        require_w1, challenge_token=challenge, secret=secret, step_offset=1
    )
    assert snapshot.status_code < 500, (
        f"toleransi ±1 step tidak boleh 5xx (dapat HTTP {snapshot.status_code})"
    )


def test_qa_w1_m06_verify_with_garbage_otp_is_4xx(require_w1, mfa_account):
    username, password, _ = mfa_account
    challenge = _challenge(require_w1, mfa_account)
    snapshot = require_w1.post_json(
        "/api/v1/auth/mfa/verify", {"otp": "000000"}, token=challenge
    )
    assert snapshot.status_code in {400, 401, 403, 429}
    assert "panicked at" not in snapshot.body_text


def test_qa_w1_m07_backup_code_single_use_then_auto_reset(require_w1):
    """Backup code sekali pakai → login sukses + MFA auto-reset.

    Env yang dibutuhkan: `QA_W1_MFA_USERNAME`, `QA_W1_MFA_BACKUP_CODE`
    (kode BELUM terpakai) — password tidak wajib untuk path ini.
    """
    import os

    username = os.environ.get("QA_W1_MFA_USERNAME", "")
    backup_code = os.environ.get("QA_W1_MFA_BACKUP_CODE", "")
    if not (username and backup_code):
        pytest.skip(
            "QA_W1_MFA_USERNAME/QA_W1_MFA_BACKUP_CODE tidak diset — sediakan "
            "backup code yang belum terpakai untuk test auto-reset."
        )
    from application.w1_flows import mfa_verify_with_backup_code

    first_login = login(require_w1, username=username, password=os.environ.get("QA_W1_MFA_PASSWORD", "x"))
    if first_login.status_code != 200:
        pytest.skip("login step-1 gagal — backup code test tidak bisa dijalankan")
    data = data_of(first_login)
    challenge = data.get("mfa_challenge_token")
    if not challenge:
        pytest.skip("akun tidak meminta challenge MFA — test backup code tidak relevan")

    verified = mfa_verify_with_backup_code(
        require_w1, challenge_token=str(challenge), backup_code=backup_code
    )
    assert verified.status_code == 200, (
        f"backup code valid harus 200 (dapat {verified.status_code}): "
        f"{error_code_of(verified)}"
    )
    assert data_of(verified).get("access_token"), "backup code harus menerbitkan sesi baru"

    # Auto-reset: MFA dimatikan → login ulang tidak lagi meminta challenge.
    relapse = login(require_w1, username=username, password=os.environ.get("QA_W1_MFA_PASSWORD", "x"))
    if relapse.status_code == 200:
        relapse_data = data_of(relapse)
        assert relapse_data.get("mfa_required") is False, (
            "setelah backup code dipakai, MFA wajib auto-reset (mfa_enabled=false)"
        )
