"""SOC-W1 TOTP REPLAY: anti-replay step pada `/auth/mfa/verify`.

Kontrak api-w1 §2/§5: toleransi ±1 step, `mfa_last_verified_step` menolak
step ≤ tersimpan; rate-limit 5 kegagalan/15 menit. Audit membuktikan kode
TOTP / backup code yang sama tidak bisa dipakai dua kali (OWASP API2,
CWE-294). Catatan RoE: jumlah verify gagal dibatasi (rate-limit upstream).
"""

from __future__ import annotations

import json
import os

import pytest

from application.w1_audit import audit_totp_replay
from application.w1_vectors import replay_otp, totp_code

pytestmark = [pytest.mark.soc, pytest.mark.auth_bypass, pytest.mark.wave1]

API = "/api/v1"


def _verify(require_target, challenge: str, payload: dict):
    return require_target.send(
        "POST",
        f"{API}/auth/mfa/verify",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {challenge}",
        },
        content=json.dumps(payload).encode(),
    )


@pytest.fixture()
def mfa_challenge(require_target):
    """Challenge token nyata dari akun MFA env (positive control)."""
    username = os.environ.get("SOC_W1_MFA_USERNAME", "")
    password = os.environ.get("SOC_W1_MFA_PASSWORD", "")
    if not (username and password):
        pytest.skip(
            "SOC_W1_MFA_USERNAME/SOC_W1_MFA_PASSWORD tidak diset — audit replay "
            "butuh akun dengan MFA aktif."
        )
    login = require_target.send(
        "POST",
        f"{API}/auth/login",
        headers={"Content-Type": "application/json"},
        content=json.dumps(
            {"company_id": "", "username": username, "password": password}
        ).encode(),
    )
    if login.status_code != 200:
        pytest.skip(f"login step-1 gagal (HTTP {login.status_code})")
    data = login.body_json.get("data", {}) if login.body_excerpt else {}
    if not data.get("mfa_required"):
        pytest.skip("akun tidak meminta challenge MFA — audit replay tidak relevan")
    challenge = data.get("mfa_challenge_token")
    if not challenge:
        pytest.skip("mfa_required tanpa challenge — kontrak dilanggar")
    return str(challenge)


def test_soc_w1_rp01_totp_replay_rejected(require_target, mfa_challenge):
    """Kode step aktif dipakai sukses lalu DI-REPLAY → kedua kalinya wajib 4xx."""
    secret = os.environ.get("SOC_W1_MFA_SECRET", "")
    if not secret:
        pytest.skip("SOC_W1_MFA_SECRET tidak diset — kode OTP nyata tidak bisa dibangun")
    otp = totp_code(secret)
    first = _verify(require_target, mfa_challenge, {"otp": otp})
    if first.status_code != 200:
        # Step mungkin bergeser saat audit berjalan lama — skip, bukan temuan.
        pytest.skip(
            f"verify pertama tidak sukses (HTTP {first.status_code}) — ulangi "
            "audit tepat setelah login"
        )
    second = _verify(require_target, mfa_challenge, {"otp": otp})
    finding = audit_totp_replay(first, second)
    assert finding.passed, f"ANTI-REPLAY GAGAL: {finding.observed}"


def test_soc_w1_rp02_backup_code_single_use(require_target, mfa_challenge):
    """Backup code yang sama dipakai dua kali → pemakaian kedua wajib ditolak."""
    backup = os.environ.get("SOC_W1_MFA_BACKUP_CODE", "")
    if not backup:
        pytest.skip("SOC_W1_MFA_BACKUP_CODE tidak diset — audit replay backup code dilewati")
    first = _verify(require_target, mfa_challenge, {"backup_code": backup})
    if first.status_code != 200:
        pytest.skip(f"backup code pertama tidak sukses (HTTP {first.status_code})")
    second = _verify(require_target, mfa_challenge, {"backup_code": backup})
    assert second.status_code in {400, 401, 403, 429}, (
        f"REPLAY backup code diterima (HTTP {second.status_code}) — "
        "sekali-pakai dilanggar; MFA auto-reset juga wajib tercatat"
    )


def test_soc_w1_rp03_replay_payload_deterministic():
    """Unit-level: `replay_otp` menghasilkan pasangan identik (definisi replay)."""
    code_a, code_b = replay_otp("GEZDGNBVGY3TQOJQ", at_unix=1_700_000_000)
    assert code_a == code_b and len(code_a) == 6
