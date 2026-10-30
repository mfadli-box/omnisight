#!/usr/bin/env python3
"""Scan tracked files for common secret material.

Run from anywhere:
    python3 osc_docs/tools/scan_secrets.py

Exit code 0 means no high-confidence secret patterns or forbidden secret files
were found. Findings never print the matching value, only the file, line, and
pattern name.
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

HIGH_CONFIDENCE = [
    (
        "private-key",
        re.compile("-----BEGIN " + r"(?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    ),
    ("aws-access-key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("github-token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b")),
    ("google-api-key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("slack-token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b")),
    ("stripe-live-key", re.compile(r"\bsk_live_[0-9A-Za-z]{24,}\b")),
    (
        "jwt",
        re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
    ),
]

ASSIGNMENT = re.compile(
    r"(?i)\b(password|passwd|secret|api[_-]?key|access[_-]?token|private[_-]?key)\b"
    r"\s*[:=]\s*[\"']?([A-Za-z0-9_./+=-]{12,})"
)

PLACEHOLDER = re.compile(
    r"(?i)^(?:"
    r"change[-_ ]?me(?:[-_ ].*)?|"
    r"placeholder(?:[-_ ].*)?|"
    r"example(?:[-_ ].*)?|"
    r"dummy(?:[-_ ].*)?|"
    r"sample|test|dev|"
    r"your[-_ ].*|"
    r"redacted(?:[-_ ].*)?|"
    r"x{4,}|<[^>]+>|\$\{[^}]+\}|%[A-Z_]+%"
    r")$"
)

FORBIDDEN_NAMES = {"id_rsa", "id_ed25519"}
FORBIDDEN_SUFFIXES = {".pem", ".key", ".p12", ".pfx"}
ALLOWED_SECRET_FILES = {"README.md"}


def tracked_files():
    try:
        output = subprocess.check_output(
            ["git", "-C", str(ROOT), "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            stderr=subprocess.DEVNULL,
        )
        return [Path(p) for p in output.decode("utf-8", "ignore").split("\0") if p]
    except (OSError, subprocess.CalledProcessError):
        skip = {".git", "node_modules", "target", ".next", "__pycache__"}
        return [
            p.relative_to(ROOT)
            for p in ROOT.rglob("*")
            if p.is_file() and not (set(p.relative_to(ROOT).parts) & skip)
        ]


def main():
    errors = []
    checked = 0

    for rel in tracked_files():
        path = ROOT / rel
        if not path.is_file():
            continue
        checked += 1
        name = path.name
        suffix = path.suffix.lower()

        if name == ".env" or (name.startswith(".env.") and name != ".env.example"):
            errors.append(f"{rel}: forbidden environment file")
        if suffix in FORBIDDEN_SUFFIXES or name in FORBIDDEN_NAMES:
            errors.append(f"{rel}: forbidden secret file type")
        if rel.parts[:2] == ("deploy", "secrets"):
            if name not in ALLOWED_SECRET_FILES and not name.endswith(".example"):
                errors.append(f"{rel}: secret file must be a README or *.example template")

        try:
            data = path.read_bytes()
        except OSError:
            continue
        if b"\0" in data[:8192]:
            continue
        text = data.decode("utf-8", "ignore")

        for line_number, line in enumerate(text.splitlines(), 1):
            for label, pattern in HIGH_CONFIDENCE:
                if pattern.search(line):
                    errors.append(f"{rel}:{line_number}: {label}")
            if suffix != ".md":
                match = ASSIGNMENT.search(line)
                if match and not PLACEHOLDER.search(match.group(2)):
                    errors.append(f"{rel}:{line_number}: secret-like assignment")

    print(f"tracked files scanned: {checked}")
    if errors:
        print("\nSECRET SCAN FINDINGS")
        for error in errors:
            print(" -", error)
        raise SystemExit(1)
    print("OK: no secret material detected")


if __name__ == "__main__":
    main()
