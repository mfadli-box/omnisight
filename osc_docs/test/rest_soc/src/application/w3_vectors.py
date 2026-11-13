"""Generator vektor serangan Wave 3 (api-w3 §2, §4) — pure, zero I/O.

Target audit (Hari 19 / SESI 4.4):
- Mandatory MFA PAM + step-up 15 menit (`403 MFA_REQUIRED_FOR_PAM` /
  `403 PAM_STEP_UP_REQUIRED`);
- Replay ephemeral PAM session ticket (sekali pakai, TTL ≤ 120 s);
- Command ACL evasion pada `pam_bastion_gateway` (evaluator REFERENSI yang
  mencerminkan kontrak ACL gateway: strip ANSI/kontrol, unwrap sudo/env +
  basename, deny menang, regex `re:` case-insensitive, malformed = deny) +
  pemindaian kebocoran plaintext kredensial vault pada respons API;
- Spoofing event SIEM/FIM tanpa HMAC valid (dan anti-spoof `asset_id`).

TIDAK ada jaringan/eksekusi di layer ini; pengiriman dilakukan test/ lewat
infrastructure dengan Rules of Engagement (target lokal, request dibatasi
``soc_config.max_requests_per_test``).
"""

from __future__ import annotations

import re
import secrets
import time
from typing import Any, Mapping, Sequence

from application.w2_vectors import SAFE_REJECTION_STATUSES  # re-export pola W2

__all__ = [
    "SAFE_REJECTION_STATUSES",
    "expected_rejection",
    "no_internal_leak",
    "STRUCTURAL_SECRET_MARKERS",
    "secret_leak_scan",
    "step_age_seconds",
    "is_step_up_required",
    "step_up_boundary_cases",
    "otp_rescue_attempts",
    "tampered_tickets",
    "malformed_tickets",
    "unwrap_program",
    "strip_ansi_and_control",
    "evaluate_command",
    "acl_evasion_vectors",
    "acl_benign_commands",
    "CANONICAL_DENY_RULES",
    "CANONICAL_CONFIRM_RULES",
    "CANONICAL_ALLOW_RULES",
    "recording_magic_forgeries",
    "forged_fim_batch",
    "forged_alert_batch",
    "forged_vulnerability_batch",
    "forged_compliance_batch",
    "hmac_forgery_cases",
    "ZERO_UUID",
]

ZERO_UUID = "00000000-0000-0000-0000-000000000000"


def expected_rejection(status: int) -> bool:
    """True bila status adalah penolakan rapi sesuai tabel error api-w3 §2."""
    return status in SAFE_REJECTION_STATUSES


def no_internal_leak(body_text: str) -> bool:
    """Bukti error tidak membocorkan detail internal (sql/panic/stack/backtrace)."""
    from application.w2_vectors import no_internal_leak as _w2

    return _w2(body_text)


# ---------------------------------------------------------------------------
# 0. Pemindai kebocoran kredensial (zero secret leakage — api-w3 §4)
# ---------------------------------------------------------------------------
STRUCTURAL_SECRET_MARKERS: tuple[str, ...] = (
    "OMS1|",  # prefiks blob Envelope AES-256-GCM vault
    "secret_encrypted",
    "mfa_secret_encrypted",
    "ws_ticket_hash",
    "dek_blob",
    "dek_wrapped",
    '"secret"',  # kunci JSON plaintext kredensial target
    '"password"',  # kunci JSON password (boleh muncul di permintaan, bukan respons PAM)
    "BEGIN OPENSSH PRIVATE KEY",
    "BEGIN RSA PRIVATE KEY",
)


def secret_leak_scan(text: str, canaries: Sequence[str] = ()) -> tuple[str, ...]:
    """Kembalikan marker/canary plaintext kredensial yang ditemukan di teks.

    ``canaries`` = nilai plaintext rahasia yang SUDAH diketahui operator QA
    (mis. isi secret akun vault uji) — respons yang memuatnya = bocoran.
    """
    lowered = text.lower()
    found = [m for m in STRUCTURAL_SECRET_MARKERS if m.lower() in lowered]
    found += [c for c in canaries if c and len(c) >= 4 and c in text]
    return tuple(found)


# ---------------------------------------------------------------------------
# 1. Mandatory MFA & step-up (api-w3 §2 — alur otorisasi langkah 3 & 6)
# ---------------------------------------------------------------------------
STEP_SECONDS = 30
DEFAULT_STEP_UP_WINDOW_MINUTES = 15


def step_age_seconds(now_step: int, last_step: int) -> int:
    """Usia verifikasi MFA = (now_step − last_step) × 30 s (api-w3 §1.1)."""
    return max(0, now_step - last_step) * STEP_SECONDS


def is_step_up_required(now_step: int, last_step: int, window_minutes: int = DEFAULT_STEP_UP_WINDOW_MINUTES) -> bool:
    """Step-up wajib bila usia > window × 60 (ketat-lebih: `>` bukan `>=`)."""
    return step_age_seconds(now_step, last_step) > window_minutes * 60


def step_up_boundary_cases() -> tuple[tuple[str, int, int, int, bool], ...]:
    """(label, now_step, last_step, window_minutes, expected_stale)."""
    return (
        ("fresh_same_step", 100_000, 100_000, 15, False),
        ("boundary_exactly_15m", 100_000, 99_970, 15, False),  # 900 s == window
        ("boundary_15m_plus_1s", 100_000, 99_969, 15, True),  # 930 s > window
        ("backup_code_step0", 100_000, 0, 15, True),  # login backup-code
        ("one_step_back_30s", 100_000, 99_999, 15, False),
        ("window_5m_expired", 100_000, 99_950, 5, True),  # 1500 s > 300 s
    )


def otp_rescue_attempts() -> tuple[tuple[str, Mapping[str, Any]], ...]:
    """Upaya pemaksaan OTP oleh user `mfa_enabled == false` — gate #3 WAJIB
    mendahului verifikasi OTP (#7): menyediakan OTP TIDAK boleh menyelamatkan."""
    return (
        ("otp_digit_six", {"otp": "123456"}),
        ("otp_empty", {"otp": ""}),
        ("otp_whitespace", {"otp": "      "}),
        ("otp_json_injection", {"otp": {"$gt": ""}}),
        ("otp_numeric", {"otp": 123456}),
    )


# ---------------------------------------------------------------------------
# 2. Replay & tampering ephemeral ticket (sekali pakai, TTL ≤ 120 s)
# ---------------------------------------------------------------------------
def tampered_tickets(ticket: str) -> tuple[tuple[str, str], ...]:
    """Varian ticket SAH yang dimanipulasi 1 bit/karakter (harus 401)."""
    if not ticket:
        return (("empty", ""),)
    last = ticket[-1]
    flipped = "0" if last != "0" else "1"
    first = ticket[0]
    first_flipped = "0" if first != "0" else "1"
    return (
        ("last_char_flip", ticket[:-1] + flipped),
        ("first_char_flip", first_flipped + ticket[1:]),
        ("truncated", ticket[:-1]),
        ("appended_zero", ticket + "0"),
        ("uppercased", ticket.upper() if ticket != ticket.upper() else ticket.lower()),
    )


def malformed_tickets() -> tuple[str, ...]:
    return (
        "",
        "deadbeef",
        "z" * 64,
        "0x" + "f" * 62,
        "ą" * 64,
        "../../etc/passwd",
        "a" * 4096,
        " " * 64,
    )


def random_ticket() -> str:
    """Bentuk valid hex-64 (256-bit), isi palsu — tidak pernah diterbitkan."""
    return secrets.token_hex(32)


# ---------------------------------------------------------------------------
# 3. Command ACL evasion — evaluator REFERENSI kontrak `pam_bastion_gateway`
#    (api-w3 §4 + Hari 17: strip ANSI/kontrol, sudo/env + basename, deny menang,
#    `re:` case-insensitive, regex malformed = deny fail-safe, confirm = deny W4)
# ---------------------------------------------------------------------------
ANSI_ESCAPE_RE = re.compile(
    r"\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]"
)
CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")

WRAPPER_BINARIES = frozenset(
    {"sudo", "env", "nohup", "nice", "time", "timeout", "setsid", "stdbuf",
     "command", "builtin", "exec", "xargs"}
)
FLAGS_WITH_VALUE = frozenset({"-u", "--user", "-g", "--group", "-C", "--chdir"})
_ASSIGNMENT_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*=.*")


def strip_ansi_and_control(line: str) -> str:
    """Lucuti ANSI escape sequence + karakter kontrol (termasuk \\x00, \\n)."""
    return CONTROL_CHARS_RE.sub("", ANSI_ESCAPE_RE.sub("", line))


def unwrap_program(tokens: Sequence[str]) -> tuple[str, Sequence[str]]:
    """Buka bungkus wrapper (sudo/env/penugasan variabel/flag) lalu basename.

    Mengembalikan (nama_program_lowercase, sisa_token). Meniru kontrak
    anti-evasion gateway: `sudo -n -u root /bin/cat` → `cat`.
    """
    idx = 0
    while idx < len(tokens):
        token = tokens[idx]
        basename = token.lower().lstrip("/\\").replace("\\", "/").split("/")[-1]
        if basename in WRAPPER_BINARIES:  # /usr/bin/env → env
            idx += 1
            continue
        if token.startswith("-"):
            idx += 2 if token in FLAGS_WITH_VALUE else 1
            continue
        if _ASSIGNMENT_RE.fullmatch(token):  # LC_ALL=C cat …
            idx += 1
            continue
        break
    if idx >= len(tokens):
        return "", ()
    raw = tokens[idx]
    program = raw.split("/")[-1].split("\\")[-1].lstrip("\\")
    return program.lower(), tokens[idx:]


def _rule_hits(rule: str, haystack: str, *, for_allow: bool = False) -> bool:
    """Satu aturan ACL: literal (case-insensitive substring) atau `re:<regex>`.

    Regex MALFORMED gagal-tutup: pada deny/confirm dianggap MATCH (deny),
    pada allow dianggap TIDAK match (tidak mengizinkan apa pun).
    """
    rule = rule.strip()
    if rule.startswith("re:"):
        try:
            return re.search(rule[3:], haystack, re.IGNORECASE) is not None
        except re.error:
            return False if for_allow else True
    return rule.lower() in haystack.lower()


def evaluate_command(
    raw_line: str,
    *,
    deny: Sequence[str] = (),
    confirm: Sequence[str] = (),
    allow: Sequence[str] = (),
) -> str:
    """Evaluator referensi ACL → "DENY" | "CONFIRM" | "ALLOW".

    Urutan keputusan (deny menang):
      1. strip ANSI + kontrol (anti smuggle newline/null-byte);
      2. unwrap sudo/env/assignment + basename (anti evasion path);
      3. aturan `deny` → DENY;
      4. aturan `confirm` → CONFIRM (di gateway W4 = deny-by-default);
      5. mode allowlist (`allow` tak kosong & tak cocok) → DENY;
      6. selainnya ALLOW.
    """
    cleaned = strip_ansi_and_control(raw_line)
    tokens = cleaned.split()
    program, _rest = unwrap_program(tokens)
    haystack = cleaned
    for rule in deny:
        if _rule_hits(rule, haystack):
            return "DENY"
    if program and any(rule.lower() == program for rule in deny):
        return "DENY"
    for rule in confirm:
        if _rule_hits(rule, haystack) or (program and rule.lower() == program):
            return "CONFIRM"
    if allow:
        allowed = any(
            _rule_hits(rule, haystack, for_allow=True) or (program and rule.lower() == program)
            for rule in allow
        )
        if not allowed:
            return "DENY"
    return "ALLOW"


CANONICAL_DENY_RULES: tuple[str, ...] = (
    "re:cat",
    "/etc/shadow",
    "re:base64",
    "re:\\bbash\\b",
    "re:xargs",
    "re:python",
)
CANONICAL_CONFIRM_RULES: tuple[str, ...] = ("re:reboot", "re:shutdown")
CANONICAL_ALLOW_RULES: tuple[str, ...] = ()


def acl_evasion_vectors() -> tuple[tuple[str, str], ...]:
    """Vektor evasion membaca `/etc/shadow` — SEMUA wajib tertangkap ACL.

    Mencakup kelas: wrapper sudo/env, assignment variabel, path absolut,
    case, backslash, ANSI escape, null-byte, tab, newline smuggling,
    command substitution, pipe decoder (base64), xargs, double-slash.
    """
    return (
        ("plain", "cat /etc/shadow"),
        ("sudo", "sudo cat /etc/shadow"),
        ("sudo_flags", "sudo -n -u root cat /etc/shadow"),
        ("env_wrapper", "env cat /etc/shadow"),
        ("env_assignment", "LC_ALL=C cat /etc/shadow"),
        ("absolute_path", "/bin/cat /etc/shadow"),
        ("uppercase", "CAT /etc/shadow"),
        ("backslash_prefix", "\\cat /etc/shadow"),
        ("ansi_wrapped", "\x1b[32mcat\x1b[0m /etc/shadow"),
        ("null_byte", "cat\x00 /etc/shadow"),
        ("tabbed", "cat\t\t/etc/shadow"),
        ("newline_smuggle", "ls\ncat /etc/shadow"),
        ("backtick_subst", "`cat /etc/shadow`"),
        ("cmd_subst", "$(/bin/cat /etc/shadow)"),
        ("printf_pipe", "printf 'cat /etc/shadow' | bash"),
        ("base64_pipe", "echo Y2F0IC9ldGMvc2hhZG93 | base64 -d | bash"),
        ("xargs", "echo /etc/shadow | xargs cat"),
        ("double_slash", "cat //etc//shadow"),
    )


def acl_benign_commands() -> tuple[str, ...]:
    """Perintah sah — ACL TIDAK boleh deny-all (fungsi tetap hidup)."""
    return (
        "ls -la /var/log",
        "systemctl status nginx",
        "kubectl get pods",
        "tail -n 50 /var/log/syslog",
        "df -h",
    )


# ---------------------------------------------------------------------------
# 4. Rekaman sesi — magic-byte forgery (upload CAST_GZ/ASCIINEMA/MP4)
# ---------------------------------------------------------------------------
def recording_magic_forgeries() -> tuple[tuple[str, bytes], ...]:
    """Body yang MENYAMAR format rekaman (magic byte wajib divalidasi server)."""
    return (
        ("plain_text_as_castgz", b"bukan gzip -- teks polos tanpa magic byte"),
        ("zip_magic_as_castgz", b"PK\x03\x04" + b"\x00" * 16),
        ("mp4_without_ftyp", b"\x00\x00\x00\x18moov" + b"\x00" * 16),
        ("json_as_castgz", b'{"ora": "asciinema v2", "cmd": "cat /etc/shadow"}'),
    )


# ---------------------------------------------------------------------------
# 5. Spoofing SIEM/FIM tanpa HMAC valid (api-w3 §2 — /agents/security/ingest)
# ---------------------------------------------------------------------------
def forged_fim_batch() -> dict[str, Any]:
    """FIM palsu: `/etc/shadow` DIMODIFIKASI — kabar palsu untuk SOC."""
    return {
        "fim_events": [
            {
                "asset_id": ZERO_UUID,
                "path": "/etc/shadow",
                "event_type": "MODIFIED",
                "detection_source": "REALTIME",
                "baseline_version": 1,
                "new_checksum": "a" * 64,
                "new_attrs": {"mode": 0o600, "uid": 0, "gid": 0, "size": 1337},
                "size_bytes": 1337,
            }
        ]
    }


def forged_alert_batch() -> dict[str, Any]:
    """Alert CRITICAL palsu ala Wazuh (MITRE T1078) — poisoning antrean SOC."""
    return {
        "security_alerts": [
            {
                "asset_id": ZERO_UUID,
                "rule_name": "Wazuh: Multiple authentication failures",
                "category": "authentication",
                "severity": "CRITICAL",
                "mitre_tactic": "Credential Access",
                "mitre_technique": "T1110",
                "source_ip": "203.0.113.66",
                "payload": {"dstuser": "root", "data": "spoofed"},
            }
        ]
    }


def forged_vulnerability_batch() -> dict[str, Any]:
    return {
        "vulnerabilities": [
            {
                "asset_id": ZERO_UUID,
                "cve_id": "CVE-2026-99999",
                "title": "Spoofed critical RCE",
                "severity": "CRITICAL",
                "cvss_score": 10.0,
                "version_installed": "1.0.0",
            }
        ]
    }


def forged_compliance_batch() -> dict[str, Any]:
    return {
        "compliance_results": [
            {
                "asset_id": ZERO_UUID,
                "benchmark": "CIS Ubuntu 22.04 LTS L1",
                "check_id": "5.2.1",
                "title": "SSH permissions configured",
                "status": "FAIL",
                "severity": "HIGH",
                "evidence": {"expected": "600", "actual": "666"},
            }
        ]
    }


def forged_spoof_batches() -> tuple[tuple[str, Mapping[str, Any]], ...]:
    """Keempat kelas event palsu (FIM/alert/CVE/compliance) tanpa HMAC."""
    return (
        ("fim", forged_fim_batch()),
        ("alert", forged_alert_batch()),
        ("vulnerability", forged_vulnerability_batch()),
        ("compliance", forged_compliance_batch()),
    )


def hmac_forgery_cases() -> tuple[str, ...]:
    """Label kasus pemalsuan HMAC (orkestrasi di test/, fault injection klien)."""
    return (
        "missing_all_headers",
        "missing_signature_only",
        "garbage_signature",
        "wrong_secret",
        "tampered_body",
        "bogus_agent_id",
        "stale_timestamp",
        "future_timestamp",
        "cross_endpoint_reuse",
    )


def stale_or_future_timestamps(now: int) -> dict[str, int]:
    return {"stale_1h": now - 3600, "future_1h": now + 3600, "stale_31s": now - 31}


def batch_over_limit_payloads() -> tuple[tuple[str, Mapping[str, Any]], ...]:
    """Batas batch api-w3 §2: fim 500 / alert 200 / vuln 500 / compliance 500."""
    one_fim = dict(forged_fim_batch()["fim_events"][0])
    one_alert = dict(forged_alert_batch()["security_alerts"][0])
    one_vuln = dict(forged_vulnerability_batch()["vulnerabilities"][0])
    one_comp = dict(forged_compliance_batch()["compliance_results"][0])
    return (
        ("fim_501", {"fim_events": [dict(one_fim, path=f"/tmp/f{i}") for i in range(501)]}),
        ("alert_201", {"security_alerts": [dict(one_alert, payload={"i": i}) for i in range(201)]}),
        ("vuln_501", {"vulnerabilities": [dict(one_vuln, cve_id=f"CVE-2026-{i:05d}") for i in range(501)]}),
        ("compliance_501", {"compliance_results": [dict(one_comp, check_id=f"c{i}") for i in range(501)]}),
    )


def invalid_event_fields() -> tuple[tuple[str, Mapping[str, Any]], ...]:
    """Payload ber-HMAC SAH tapi field invalid — validasi harus sebelum persist."""
    bad_checksum = dict(forged_fim_batch()["fim_events"][0])
    bad_checksum["new_checksum"] = "zz" * 32  # bukan hex-64
    bad_cve = dict(forged_vulnerability_batch()["vulnerabilities"][0])
    bad_cve["cve_id"] = "NOT-A-CVE"
    bad_cvss = dict(forged_vulnerability_batch()["vulnerabilities"][0])
    bad_cvss["cve_id"] = "CVE-2026-00001"
    bad_cvss["cvss_score"] = 99.0
    bad_enum = dict(forged_compliance_batch()["compliance_results"][0])
    bad_enum["status"] = "MAYBE"
    return (
        ("fim_bad_checksum", {"fim_events": [bad_checksum]}),
        ("cve_malformed", {"vulnerabilities": [bad_cve]}),
        ("cvss_out_of_range", {"vulnerabilities": [bad_cvss]}),
        ("compliance_bad_enum", {"compliance_results": [bad_enum]}),
    )


def ingest_epoch_now() -> int:
    return int(time.time())
