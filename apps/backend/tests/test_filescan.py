"""Unit tests for upload content sniffing (app.core.filescan)."""

from __future__ import annotations

import pytest

from app.core.filescan import SNIFF_LEN, content_matches_declared, sniff_kind


def _pdf() -> bytes:
    return b"%PDF-1.7\n%fake body" + b"x" * 64


def _zip() -> bytes:
    return b"PK\x03\x04" + b"\x14\x00" + b"y" * 64


def _docx_declared_zip() -> bytes:
    return _zip()


def _ole2() -> bytes:
    return b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"z" * 64


def _ps() -> bytes:
    return b"%!PS-Adobe-3.0\n" + b"w" * 32


@pytest.mark.parametrize(
    ("head", "expected"),
    [
        (_pdf(), "pdf"),
        (_zip(), "zip"),
        (_ole2(), "ole2"),
        (_ps(), "postscript"),
        (b"hello world\nplain text", "text"),
        (b"\x89PNG\r\n\x1a\n" + b"0" * 32, None),
        (b"", None),
        (b"\x00\x01\x02binary", None),
    ],
)
def test_sniff_kind(head: bytes, expected: str | None) -> None:
    assert sniff_kind(head) == expected


def test_pdf_content_matches_pdf_declaration_only() -> None:
    head = _pdf()
    assert content_matches_declared(head, "application/pdf")
    assert not content_matches_declared(head, "application/zip")
    assert not content_matches_declared(head, "text/plain")


def test_zip_container_accepts_docx_and_zip_declarations() -> None:
    head = _docx_declared_zip()
    assert content_matches_declared(head, "application/zip")
    assert content_matches_declared(
        head, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert not content_matches_declared(head, "application/pdf")


def test_ole2_matches_msword() -> None:
    assert content_matches_declared(_ole2(), "application/msword")
    assert not content_matches_declared(_ole2(), "application/pdf")


def test_postscript_matches() -> None:
    assert content_matches_declared(_ps(), "application/postscript")


def test_text_matches_plain_text() -> None:
    head = b"# Manuscript\n\nSome notes."
    assert content_matches_declared(head, "text/plain")
    assert not content_matches_declared(head, "application/pdf")


def test_unknown_content_is_rejected_even_without_declaration() -> None:
    assert not content_matches_declared(b"\x89PNG\r\n\x1a\n" + b"0" * 16, None)


def test_utf8_multibyte_text_still_detected() -> None:
    head = "中文摘要：这是一份纯文本稿件。".encode() * 8
    assert len(head) < SNIFF_LEN
    assert sniff_kind(head) == "text"
