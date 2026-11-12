"""Generator payload batas (boundary) — murni, tanpa I/O.

Dipakai test boundary pada fase fitur (users/excel): nilai tepat di batas,
satu di bawah, dan satu di atas rentang yang wajar.
"""

from __future__ import annotations

from typing import Any


def boundary_integers(low: int = 0, high: int = 100) -> tuple[int, ...]:
    """Nilai di batas rentang [low, high] + ekstrem int32 (tanpa duplikat)."""
    candidates = {
        low - 1,
        low,
        low + 1,
        high - 1,
        high,
        high + 1,
        0,
        -1,
        -(2**31),
        2**31 - 1,
    }
    return tuple(sorted(candidates))


def oversized_text(length: int = 1_048_576) -> str:
    """Teks satu karakter berulang sepanjang ``length`` (default 1 MiB)."""
    if length < 0:
        raise ValueError("length tidak boleh negatif")
    return "A" * length


def empty_and_whitespace() -> tuple[str, ...]:
    """Varian string kosong/whitespace untuk test validasi field."""
    return ("", " ", "\t", "\n", "\r\n", "  teks  ber spasi  ")


def unicode_and_control() -> tuple[str, ...]:
    """Unicode multi-byte + karakter kontrol untuk test sanitasi/encoding."""
    return ("emoji-🔤", "RTL: אבג", "NUL:a\x00b", "newline:a\nb", "aksen: é")


def invalid_type_values() -> tuple[Any, ...]:
    """Nilai dengan tipe salah untuk abuse type-coercion API/ORM."""
    return (None, True, 3.14, [], {}, ("tuple",), 10**100)
