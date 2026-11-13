"""Unit test vektor infra Wave 2 — mirror validator & generator (no I/O)."""

from __future__ import annotations

import pytest

from application.infra_vectors import (
    STACK_DISPATCH_COMMANDS,
    dispatch_command_injections,
    invalid_compose_samples,
    invalid_nginx_samples,
    nginx_server_name_injections,
    traversal_stack_names,
    traversal_working_dirs,
    valid_compose_sample,
    valid_nginx_sample,
    validate_compose_content,
    validate_dispatch_command,
    validate_nginx_content,
    validate_stack_name,
    validate_working_dir,
)

pytestmark = pytest.mark.unit


def test_valid_compose_passes_mirror():
    assert validate_compose_content(valid_compose_sample()) == []


def test_valid_nginx_passes_mirror():
    assert validate_nginx_content(valid_nginx_sample()) == []


def test_traversal_names_are_invalid():
    for name in traversal_stack_names():
        assert validate_stack_name(name), f"nama {name!r} harus ditolak"


def test_traversal_working_dirs_are_invalid():
    for path in traversal_working_dirs():
        errors = validate_working_dir(path)
        assert errors, f"working_dir {path!r} harus ditolak"


def test_invalid_compose_samples_all_detected():
    samples = invalid_compose_samples()
    assert set(samples) == {
        "include_top_level", "tab_indent", "missing_services",
        "service_no_source", "unknown_top_level", "oversize",
    }
    for label, content in samples.items():
        assert validate_compose_content(content), f"{label} lolos mirror — vektornya salah"


def test_invalid_nginx_samples_all_detected():
    samples = invalid_nginx_samples()
    assert set(samples) == {
        "brace_unbalanced", "no_server_block", "include_traversal",
        "include_relative", "oversize",
    }
    for label, content in samples.items():
        assert validate_nginx_content(content), f"{label} lolos mirror — vektornya salah"


def test_server_name_injections_contain_metachars():
    for name in nginx_server_name_injections():
        assert any(c in name for c in ";`$|&\\ \n\x00"), f"vektor {name!r} tanpa metakarakter"


def test_dispatch_injections_outside_allowlist():
    for command in dispatch_command_injections():
        assert validate_dispatch_command(command, STACK_DISPATCH_COMMANDS), (
            f"command {command!r} harus di luar allowlist"
        )
    for command in ("up", "down", "pull", "restart"):
        assert not validate_dispatch_command(command, STACK_DISPATCH_COMMANDS)
