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


def _fake_png() -> bytes:
    """Realistic PNG head: signature + IHDR chunk (length field carries
    NUL bytes, as in every real PNG) followed by dense binary data."""
    return b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + bytes(range(256))


@pytest.mark.parametrize(
    ("head", "expected"),
    [
        (_pdf(), "pdf"),
        (_zip(), "zip"),
        (_ole2(), "ole2"),
        (_ps(), "postscript"),
        (b"hello world\nplain text", "text"),
        # 权衡说明：text 启发式只看「无 NUL + 高可打印占比」，不校验字符
        # 编码（否则 GBK 等合法文本会被误杀）。因此不含 NUL 的人造二进制
        # 可能落进 text —— 真实二进制格式（PNG/ZIP/OLE2…）的长度字段与
        # 像素数据几乎必然携带 NUL，此处用真实结构做反例。
        (_fake_png(), None),
        (b"", None),
        (bytes(range(1, 32)) * 8, None),
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
    assert not content_matches_declared(_fake_png(), None)


def test_utf8_multibyte_text_still_detected() -> None:
    head = "中文摘要：这是一份纯文本稿件。".encode() * 8
    assert len(head) < SNIFF_LEN
    assert sniff_kind(head) == "text"


def test_legacy_encoded_text_still_detected_as_text() -> None:
    """GBK/Shift-JIS/Latin-1 纯文本必须仍判定为 text（0.2.0 回归修复：
    早期实现强制 UTF-8 解码，会把 Windows 中文系统常见的 GBK 编码
    .txt 稿件误判为未知二进制而拒绝上传）。"""
    gbk = "中文稿件：这是一个用 GBK 编码的纯文本文件。".encode("gbk")
    sjis = "日本語のテキストファイルです。".encode("shift_jis")
    latin1 = b"caf\xe9 r\xe9sum\xe9 - plain ascii-safe sample text"
    for label, head in (("gbk", gbk), ("sjis", sjis), ("latin1", latin1)):
        assert sniff_kind(head) == "text", label
        assert content_matches_declared(head, "text/plain"), label
