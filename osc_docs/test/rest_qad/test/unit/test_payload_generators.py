"""QA-UNIT: generator payload batas — murni, tanpa jaringan/OS."""

from __future__ import annotations

import pytest

from application.payload_generators import (
    boundary_integers,
    empty_and_whitespace,
    invalid_type_values,
    oversized_text,
    unicode_and_control,
)

pytestmark = pytest.mark.unit


def test_qa_boundary_integers_contains_edges_and_beyond():
    values = boundary_integers(0, 100)
    assert all(isinstance(value, int) for value in values)
    assert min(values) == -(2**31)
    assert max(values) == 2**31 - 1
    # tepat di batas dan satu di luarnya:
    assert {0, 1, -1, 99, 100, 101}.issubset(set(values))


def test_qa_boundary_integers_no_duplicates():
    values = boundary_integers(0, 100)
    assert len(values) == len(set(values))


def test_qa_oversized_text_exact_length_and_negative_rejected():
    assert oversized_text(64) == "A" * 64
    assert len(oversized_text()) == 1_048_576
    with pytest.raises(ValueError):
        oversized_text(-1)


def test_qa_empty_and_whitespace_variants():
    variants = empty_and_whitespace()
    assert "" in variants
    assert " " in variants
    assert any(text != text.strip() for text in variants)


def test_qa_unicode_and_control_contains_nul():
    assert any("\x00" in text for text in unicode_and_control())
    assert any(text for text in unicode_and_control())  # tidak ada string kosong


def test_qa_invalid_type_values_are_non_string():
    assert any(not isinstance(value, str) for value in invalid_type_values())
    assert None in invalid_type_values()
