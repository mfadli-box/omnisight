#!/usr/bin/env python3
"""Validate osc_docs consistency.

Run from anywhere:
    python3 osc_docs/tools/validate_docs.py

Exit code 0 means every check passed. Contract-level checks (permissions,
error registry, locales, OpenAPI, Prisma) live in
osc_docs/technical/contracts/validate_contracts.py.
"""

import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "osc_docs"
MD = sorted(DOCS.rglob("*.md"))

errors = []
warnings = []

if not MD:
    print("no markdown files found under", DOCS)
    raise SystemExit(1)

# 1. Internal links.
link_re = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
missing = []
for p in MD:
    text = p.read_text(encoding="utf-8")
    for target in link_re.findall(text):
        target = target.strip()
        if target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        path_part = unquote(target.split("#", 1)[0])
        if not path_part:
            continue
        resolved = (p.parent / path_part).resolve()
        if not resolved.exists():
            missing.append((p.relative_to(ROOT), target))
if missing:
    errors.append(f"{len(missing)} broken links")
    for src, tgt in missing:
        errors.append(f"  {src} -> {tgt}")

# 2. Code fences.
for p in MD:
    fences = sum(1 for line in p.read_text(encoding="utf-8").splitlines() if line.strip().startswith("```"))
    if fences % 2:
        errors.append(f"unbalanced fences: {p.relative_to(ROOT)} ({fences})")

# 3. Status lines.
old_status = [p.relative_to(ROOT) for p in MD if "Status: Review (0.5)" in p.read_text(encoding="utf-8")]
if old_status:
    errors.append(f"stale 0.5 status in {len(old_status)} files: {old_status}")

# 3b. Semantic drift: no "no implementation" claim once scaffolds exist.
scaffold_paths = [ROOT / "osc_rest" / "Cargo.toml", ROOT / "osc_site" / "package.json"]
if all(p.exists() for p in scaffold_paths):
    stale_no_code = [
        p.relative_to(ROOT)
        for p in MD
        if "Belum ada implementasi kode." in p.read_text(encoding="utf-8")
    ]
    if stale_no_code:
        errors.append(f"stale 'no implementation' claim in {stale_no_code}")

# 4. Submodule coverage.
peta = (DOCS / "product/peta-modul.md").read_text(encoding="utf-8")
peta_codes = sorted(set(re.findall(r"^\| (A[A-M]\d{2}) \|", peta, re.M)))
matrix = (DOCS / "security/matriks-izin.md").read_text(encoding="utf-8")
matrix_codes = sorted(set(re.findall(r"^\| (A[A-M]\d{2}) \|", matrix, re.M)))
if len(peta_codes) != 76:
    errors.append(f"peta-modul submodule count {len(peta_codes)}, expected 76")
missing_matrix = sorted(set(peta_codes) - set(matrix_codes))
if missing_matrix:
    errors.append(f"submodules missing from matrix: {missing_matrix}")
extra_matrix = sorted(set(matrix_codes) - set(peta_codes))
if extra_matrix:
    errors.append(f"matrix has extra submodules: {extra_matrix}")

# 5. Permission code references exist.
perm_re = re.compile(r"\b(A[A-M]\d{0,2}):(read|post)\b")
doc_perms = {}
for p in MD:
    for m in perm_re.finditer(p.read_text(encoding="utf-8")):
        doc_perms.setdefault(m.group(1), set()).add(p.relative_to(ROOT))
valid_modules = {c[:2] for c in peta_codes} | set(peta_codes)
bad_perms = {code: files for code, files in doc_perms.items() if code not in valid_modules}
if bad_perms:
    for code, files in sorted(bad_perms.items()):
        errors.append(f"unknown permission code {code} in {sorted(str(f) for f in files)}")

# 6. UAT IDs (definitions are table rows that start with the ID).
uat_def_re = re.compile(r"^\| (UAT-(?:G|[A-M]{2})-\d{2}) \|", re.M)
uat_counts = {}
for p in MD:
    for uid in uat_def_re.findall(p.read_text(encoding="utf-8")):
        uat_counts[uid] = uat_counts.get(uid, 0) + 1
dupe_uats = {k: v for k, v in uat_counts.items() if v > 1}
if dupe_uats:
    errors.append(f"duplicate UAT definitions: {dupe_uats}")

# 7. Acceptance module files.
acc = DOCS / "qaqc/acceptance"
expected = [
    "aa-dashboard.md", "ab-identity.md", "ac-assets.md", "ad-network.md",
    "ae-monitoring.md", "af-containers.md", "ag-edge.md", "ah-backup.md",
    "ai-access.md", "aj-service-desk.md", "ak-content.md", "al-audit.md",
    "am-platform.md",
]
for name in expected:
    p = acc / name
    if not p.exists():
        errors.append(f"missing acceptance file: {name}")
        continue
    text = p.read_text(encoding="utf-8")
    if len(re.findall(r"UAT-[A-M]{2}-\d{2}", text)) < 6:
        warnings.append(f"{name}: fewer than 6 module scenarios")
    if "UAT-G-01" not in text:
        warnings.append(f"{name}: no global scenario reference")

# 8. Key consistency checks.
api = (DOCS / "technical/backend/kontrak-api.md").read_text(encoding="utf-8")
menu = (DOCS / "technical/frontend/peta-menu.md").read_text(encoding="utf-8")
schema = (DOCS / "technical/database/skema-inti.md").read_text(encoding="utf-8")
checks = {
    "AM08 in peta-modul": "AM08" in peta,
    "AM08 in peta-menu": "AM08" in menu,
    "AM08 in kontrak-api": "AM08" in api,
    "AM08 in matrix": "AM08" in matrix,
    "requester role in schema": "| `requester` | Requester |" in schema,
    "platform roles table in schema": "core.user_platform_roles" in schema,
    "requester in role matrix": "requester" in matrix,
    "contracts referenced by docs index": "technical/contracts/README.md" in (DOCS / "README.md").read_text(encoding="utf-8"),
}
for name, ok in checks.items():
    if not ok:
        errors.append(f"consistency check failed: {name}")

# 9. Module error codes referenced must be registered.
err_re = re.compile(r"\bA[A-M]-[0-9]{2}-[0-9]{4}\b")
registry = (DOCS / "technical/backend/kode-error.md").read_text(encoding="utf-8")
registered = set(err_re.findall(registry))
referenced = {}
for p in MD:
    for code in err_re.findall(p.read_text(encoding="utf-8")):
        referenced.setdefault(code, set()).add(p.relative_to(ROOT))
unregistered = {code: files for code, files in referenced.items() if code not in registered}
if unregistered:
    for code, files in sorted(unregistered.items()):
        errors.append(f"unregistered module error code {code} in {sorted(str(f) for f in files)}")

# 10. Contract artifacts exist.
contracts = DOCS / "technical/contracts"
for name in ("openapi.json", "permissions.json", "kode-error.json", "schema.prisma", "README.md"):
    if not (contracts / name).exists():
        errors.append(f"missing contract artifact: technical/contracts/{name}")
for lang in ("en", "id"):
    for surface in ("backend", "frontend"):
        if not (contracts / "locales" / surface / f"{lang}.json").exists():
            errors.append(f"missing locale catalog: technical/contracts/locales/{surface}/{lang}.json")

# 11. Counts.
print(f"markdown files: {len(MD)}")
print(f"submodules: {len(peta_codes)}")
print(f"matrix submodule rows: {len(matrix_codes)}")
print(f"UAT IDs unique: {len(uat_counts)}")
print(f"acceptance docs: {len(list(acc.glob('*.md')))}")
print(f"module error codes registered: {len(registered)}")
print(f"module error codes referenced: {len(referenced)}")

if warnings:
    print("\nWARNINGS")
    for w in warnings:
        print(" -", w)

if errors:
    print("\nERRORS")
    for e in errors:
        print(" -", e)
    raise SystemExit(1)
print("\nOK: all checks passed")
