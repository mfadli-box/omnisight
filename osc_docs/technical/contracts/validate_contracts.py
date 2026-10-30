#!/usr/bin/env python3
"""Validate the machine-readable contracts in technical/contracts.

Run from anywhere:
    python3 osc_docs/technical/contracts/validate_contracts.py

Exit code 0 means every contract is internally consistent and agrees with the
other contracts. Human-readable document checks live in
osc_docs/tools/validate_docs.py.
"""

import json
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[2]

errors = []
warnings = []


def fail(msg):
    errors.append(msg)


def load(name):
    path = BASE / name
    if not path.exists():
        fail(f"missing {name}")
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"{name}: invalid JSON: {exc}")
        return None


def keys_of(obj, prefix=""):
    out = set()
    for key, value in obj.items():
        full = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            out |= keys_of(value, full)
        else:
            out.add(full)
    return out


permissions = load("permissions.json")
error_registry = load("kode-error.json")
openapi = load("openapi.json")

# ---------------------------------------------------------------------------
# permissions.json
# ---------------------------------------------------------------------------
modules = set()
submodules = {}
perm_codes = set()

if permissions:
    if permissions.get("status") != "approved":
        fail(f"permissions.json: status {permissions.get('status')!r}, expected 'approved'")
    if permissions.get("version") != "0.6.0":
        fail(f"permissions.json: version {permissions.get('version')!r}, expected '0.6.0'")

    for module in permissions.get("modules", []):
        code = module.get("code", "")
        if not re.fullmatch(r"A[A-M]", code):
            fail(f"permissions.json: invalid module code {code!r}")
        if code in modules:
            fail(f"permissions.json: duplicate module {code}")
        modules.add(code)

    if len(modules) != 13:
        fail(f"permissions.json: {len(modules)} modules, expected 13")

    for sub in permissions.get("submodules", []):
        code = sub.get("code", "")
        if not re.fullmatch(r"A[A-M]\d{2}", code):
            fail(f"permissions.json: invalid submodule code {code!r}")
            continue
        if code in submodules:
            fail(f"permissions.json: duplicate submodule {code}")
        submodules[code] = sub
        if sub.get("module") != code[:2]:
            fail(f"permissions.json: {code} module mismatch")
        if code[:2] not in modules:
            fail(f"permissions.json: {code} references unknown module {code[:2]}")
        for action in ("read", "post"):
            perm = sub.get("permissions", {}).get(action)
            if perm is not None:
                perm_codes.add(perm)
                sub_code = perm.split(":", 1)[0]
                if sub_code not in (code, code[:2]):
                    fail(f"permissions.json: {code} has {action} permission {perm}")

    if len(submodules) != 76:
        fail(f"permissions.json: {len(submodules)} submodules, expected 76")

    declared = set(permissions.get("permission_codes", []))
    if declared != perm_codes:
        only_declared = sorted(declared - perm_codes)
        only_used = sorted(perm_codes - declared)
        fail(f"permissions.json: permission_codes mismatch (declared-only={only_declared}, used-only={only_used})")
    if len(declared) != 64:
        fail(f"permissions.json: {len(declared)} permission codes, expected 64")

    replace = {code for code, sub in submodules.items() if sub.get("sensitive_permission_replaces_module")}
    sensitive = {row.get("code") for row in permissions.get("sensitive_submodules", [])}
    if len(sensitive) != 20:
        fail(f"permissions.json: {len(sensitive)} sensitive submodules, expected 20")
    if replace != sensitive:
        fail(f"permissions.json: sensitive list mismatch (replace-only={sorted(replace - sensitive)}, list-only={sorted(sensitive - replace)})")
    for code in sensitive:
        sub = submodules.get(code)
        if not sub:
            fail(f"permissions.json: sensitive submodule {code} not defined")
            continue
        for action in ("read", "post"):
            perm = sub["permissions"].get(action)
            if perm and not perm.startswith(code + ":"):
                fail(f"permissions.json: sensitive {code} uses module permission {perm}")

    if len(permissions.get("system_roles", {})) != 7:
        fail("permissions.json: expected 7 system roles")
    if len(permissions.get("platform_roles", {})) != 3:
        fail("permissions.json: expected 3 platform roles")

    allowed_self = perm_codes | {"session:self"}
    for row in permissions.get("self_service", []):
        if row.get("permission") not in allowed_self:
            fail(f"permissions.json: self-service permission {row.get('permission')} is not registered")

# ---------------------------------------------------------------------------
# kode-error.json
# ---------------------------------------------------------------------------
global_codes = set()
module_codes = set()
field_codes = set()
registered_codes = set()

if error_registry:
    if error_registry.get("status") != "approved":
        fail(f"kode-error.json: status {error_registry.get('status')!r}, expected 'approved'")
    if error_registry.get("version") != "0.6.0":
        fail(f"kode-error.json: version {error_registry.get('version')!r}, expected '0.6.0'")
    policy = error_registry.get("http_policy", {})
    if policy.get("business_status") != 200:
        fail("kode-error.json: business_status must be 200")
    if policy.get("forbidden_status_allowed") is not False:
        fail("kode-error.json: 403 must not be allowed")
    if policy.get("server_error_status_allowed") is not False:
        fail("kode-error.json: 5xx must not be allowed")

    for row in error_registry.get("global", []):
        code = row.get("code", "")
        if not re.fullmatch(r"AA00-00-\d{4}", code):
            fail(f"kode-error.json: invalid global code {code!r}")
            continue
        if code in registered_codes:
            fail(f"kode-error.json: duplicate code {code}")
        registered_codes.add(code)
        global_codes.add(code)

    for row in error_registry.get("module", []):
        code = row.get("code", "")
        match = re.fullmatch(r"(A[A-M])-(\d{2})-\d{4}", code)
        if not match:
            fail(f"kode-error.json: invalid module code {code!r}")
            continue
        if code in registered_codes:
            fail(f"kode-error.json: duplicate code {code}")
        registered_codes.add(code)
        module_codes.add(code)
        module, submenu = match.groups()
        if module not in modules:
            fail(f"kode-error.json: {code} uses unknown module {module}")
        if submenu != "00" and module + submenu not in submodules:
            fail(f"kode-error.json: {code} uses unknown submodule {module + submenu}")

    for row in error_registry.get("field", []):
        code = row.get("code", "")
        if not re.fullmatch(r"[a-z][a-z0-9_]*", code):
            fail(f"kode-error.json: invalid field code {code!r}")
        if code in field_codes:
            fail(f"kode-error.json: duplicate field code {code}")
        field_codes.add(code)

    for section in ("global", "module"):
        for row in error_registry.get(section, []):
            code = row.get("code", "?")
            if row.get("http") != 200:
                fail(f"kode-error.json: {code} uses HTTP {row.get('http')}, expected 200")
            for key in ("meaning_en", "meaning_id", "default_message_en", "default_message_id"):
                if not row.get(key):
                    fail(f"kode-error.json: {code} missing {key}")
            if row.get("retry") not in error_registry.get("retry_values", []):
                fail(f"kode-error.json: {code} has unknown retry {row.get('retry')!r}")
            if row.get("audit") not in error_registry.get("audit_values", []):
                fail(f"kode-error.json: {code} has unknown audit {row.get('audit')!r}")

    if len(global_codes) != 13:
        fail(f"kode-error.json: {len(global_codes)} global codes, expected 13")
    if len(module_codes) != 14:
        fail(f"kode-error.json: {len(module_codes)} module codes, expected 14")
    if len(field_codes) != 10:
        fail(f"kode-error.json: {len(field_codes)} field codes, expected 10")

# ---------------------------------------------------------------------------
# locales
# ---------------------------------------------------------------------------
locale_counts = {}
for surface in ("backend", "frontend"):
    catalogs = {}
    for lang in ("en", "id"):
        path = BASE / "locales" / surface / f"{lang}.json"
        if not path.exists():
            fail(f"missing locale {surface}/{lang}.json")
            continue
        try:
            catalogs[lang] = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            fail(f"locale {surface}/{lang}.json: {exc}")
            continue
    if len(catalogs) != 2:
        continue
    en_keys = keys_of(catalogs["en"])
    id_keys = keys_of(catalogs["id"])
    if en_keys != id_keys:
        fail(f"{surface} locale parity failed (en-only={sorted(en_keys - id_keys)}, id-only={sorted(id_keys - en_keys)})")
    locale_counts[surface] = len(en_keys)

if locale_counts.get("backend") != 37:
    fail(f"backend locale has {locale_counts.get('backend')} keys, expected 37")
if locale_counts.get("frontend") != 105:
    fail(f"frontend locale has {locale_counts.get('frontend')} keys, expected 105")

backend_en_path = BASE / "locales" / "backend" / "en.json"
if backend_en_path.exists() and error_registry:
    backend_en = json.loads(backend_en_path.read_text(encoding="utf-8"))
    if set(backend_en.get("error", {})) != registered_codes:
        fail("backend locale error keys do not match the error registry")
    if set(backend_en.get("validation", {})) != field_codes:
        fail("backend locale validation keys do not match field codes")

# ---------------------------------------------------------------------------
# openapi.json
# ---------------------------------------------------------------------------
operations = []
allowed_op_perms = perm_codes | {"session:self"}
known_modules = modules | {"AUTH", "PUB", "INTERNAL"}

if openapi:
    if not str(openapi.get("openapi", "")).startswith("3.1"):
        fail(f"openapi.json: version {openapi.get('openapi')!r}, expected 3.1.x")
    contract_meta = openapi.get("x-contract", {})
    if contract_meta.get("status") != "approved":
        fail(f"openapi.json: x-contract.status {contract_meta.get('status')!r}, expected 'approved'")
    if contract_meta.get("version") != "0.6.0":
        fail(f"openapi.json: x-contract.version {contract_meta.get('version')!r}, expected '0.6.0'")
    if openapi.get("info", {}).get("version") != "0.6.0":
        fail(f"openapi.json: info.version {openapi.get('info', {}).get('version')!r}, expected '0.6.0'")
    paths = openapi.get("paths", {})
    for path, item in paths.items():
        for method, op in item.items():
            if method.lower() not in ("get", "post", "put", "patch", "delete"):
                continue
            operations.append((method.upper(), path, op))

    if len(paths) != 144:
        fail(f"openapi.json: {len(paths)} paths, expected 144")
    if len(operations) != 201:
        fail(f"openapi.json: {len(operations)} operations, expected 201")

    operation_ids = set()
    for method, path, op in operations:
        label = f"{method} {path}"
        op_id = op.get("operationId")
        if not op_id:
            fail(f"openapi.json: {label} missing operationId")
        elif op_id in operation_ids:
            fail(f"openapi.json: duplicate operationId {op_id}")
        else:
            operation_ids.add(op_id)

        for key in ("x-module", "x-permission", "x-scope", "x-sensitive", "x-approval", "x-audit"):
            if key not in op:
                fail(f"openapi.json: {label} missing {key}")

        module = op.get("x-module")
        if module not in known_modules:
            fail(f"openapi.json: {label} has unknown module {module!r}")

        for perm in op.get("x-permission", []):
            if perm not in allowed_op_perms:
                fail(f"openapi.json: {label} references unknown permission {perm}")

        if method == "GET" and op.get("x-approval") != "none":
            fail(f"openapi.json: {label} GET must not require approval")

        if method == "GET" and op.get("x-sensitive") and not op.get("x-audit"):
            fail(f"openapi.json: {label} sensitive GET must be audited")

        if "403" in op.get("responses", {}):
            fail(f"openapi.json: {label} returns 403")
        for status in op.get("responses", {}):
            if status.startswith("5") and path != "/internal/healthz":
                fail(f"openapi.json: {label} returns {status}")

    for tag in openapi.get("tags", []):
        if not tag.get("name"):
            fail("openapi.json: tag without name")

# ---------------------------------------------------------------------------
# schema.prisma
# ---------------------------------------------------------------------------
schema_path = BASE / "schema.prisma"
schema = ""
if not schema_path.exists():
    fail("missing schema.prisma")
else:
    schema = schema_path.read_text(encoding="utf-8")
    models = re.findall(r"^model (\w+) \{", schema, re.M)
    if len(models) != 34:
        fail(f"schema.prisma: {len(models)} models, expected 34")
    if len(set(models)) != len(models):
        fail("schema.prisma: duplicate model names")
    if schema.count("{") != schema.count("}"):
        fail("schema.prisma: unbalanced braces")
    blocks = re.findall(r"^model (\w+) \{(.*?)^\}", schema, re.M | re.S)
    if len(blocks) != len(models):
        fail("schema.prisma: could not parse every model block")
    schema_attrs = []
    for name, body in blocks:
        if not re.search(r"@id\b|@@id\(", body):
            fail(f"schema.prisma: model {name} has no primary key")
        schema_match = re.search(r'@@schema\("(\w+)"\)', body)
        if not schema_match:
            fail(f"schema.prisma: model {name} has no @@schema")
        else:
            schema_attrs.append(schema_match.group(1))
        if not re.search(r"@@map\(", body):
            fail(f"schema.prisma: model {name} has no @@map")
    if set(schema_attrs) - {"core", "audit", "platform"}:
        fail(f"schema.prisma: unexpected schemas {sorted(set(schema_attrs))}")
    for line in schema.splitlines():
        if "@db.ByteA" in line and not re.search(r"\bBytes\??\s", line):
            fail(f"schema.prisma: bytea field is not Bytes: {line.strip()}")

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print(f"permissions: {len(modules)} modules, {len(submodules)} submodules, {len(perm_codes)} permissions")
print(f"error registry: {len(global_codes)} global, {len(module_codes)} module, {len(field_codes)} field")
print(f"locales: backend {locale_counts.get('backend', 0)} keys, frontend {locale_counts.get('frontend', 0)} keys")
print(f"openapi: {len(openapi.get('paths', {})) if openapi else 0} paths, {len(operations)} operations")
print(f"schema.prisma: {len(re.findall(r'^model ', schema, re.M)) if schema_path.exists() else 0} models")

if warnings:
    print("\nWARNINGS")
    for warning in warnings:
        print(" -", warning)

if errors:
    print("\nERRORS")
    for error in errors:
        print(" -", error)
    raise SystemExit(1)

print("\nOK: contracts are consistent")
