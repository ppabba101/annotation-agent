from __future__ import annotations

import re

SUPPORTED_CHARS: str = ' _!"#&\'()*+,-./0123456789:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

CHAR_SET: set[str] = set(SUPPORTED_CHARS)


def sanitize_text(text: str) -> str:
    """Remove unsupported characters and collapse multiple spaces into one."""
    filtered = "".join(ch for ch in text if ch in CHAR_SET)
    return re.sub(r" {2,}", " ", filtered)


def validate_text(text: str) -> tuple[bool, str]:
    """Return (is_valid, sanitized_text).

    is_valid is True when text contains only supported characters.
    sanitized_text is always the cleaned version.
    """
    sanitized = sanitize_text(text)
    is_valid = all(ch in CHAR_SET for ch in text)
    return is_valid, sanitized


def get_unsupported_chars(text: str) -> set[str]:
    """Return the set of characters in text that are not in SUPPORTED_CHARS."""
    return {ch for ch in text if ch not in CHAR_SET}
