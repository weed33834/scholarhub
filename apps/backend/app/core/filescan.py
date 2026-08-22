"""Upload content sniffing — verify declared MIME against real bytes.

Clients declare ``Content-Type`` themselves, so trusting it alone lets a
malicious author upload arbitrary payloads (HTML/JS droppers, binaries)
under an innocuous ``.pdf`` name. Before persisting an upload we peek at
the leading bytes and require the *content* to match one of the whitelisted
formats. No third-party dependency (libmagic et al.) — the accepted set is
small and its signatures are stable.
"""

from __future__ import annotations

# How many leading bytes we inspect. Every signature below fits well within
# 8 KiB; the same slice doubles as the UTF-8 validation sample.
SNIFF_LEN = 8 * 1024

_PDF_MAGIC = b"%PDF-"
_ZIP_MAGIC = b"PK\x03\x04"  # also the container of modern .docx
_OLE2_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # legacy .doc (CFB)
_PS_BINARY_MAGIC = b"\xc5\xd0\xd3\xc6"  # DOS-binary EPS wrapper
_PS_TEXT_MAGIC = b"%!PS"


def sniff_kind(head: bytes) -> str | None:
    """Classify leading bytes into a canonical kind, or ``None``.

    Kinds: ``pdf`` / ``zip`` (docx or archive) / ``ole2`` (legacy doc) /
    ``postscript`` / ``text``.
    """
    if head.startswith(_PDF_MAGIC):
        return "pdf"
    if head.startswith(_ZIP_MAGIC):
        return "zip"
    if head.startswith(_OLE2_MAGIC):
        return "ole2"
    if head.startswith(_PS_BINARY_MAGIC) or head.startswith(_PS_TEXT_MAGIC):
        return "postscript"

    # text/plain heuristic: no NUL bytes and decodable as UTF-8. Binary
    # formats almost always contain NULs early, so this keeps false
    # positives negligible while accepting every honest text upload.
    sample = head[:4096]
    if sample and b"\x00" not in sample:
        try:
            sample.decode("utf-8")
            return "text"
        except UnicodeDecodeError:
            pass
    return None


# kind -> declared MIME types whose content could legitimately produce it.
_KIND_ALLOWS: dict[str, frozenset[str]] = {
    "pdf": frozenset({"application/pdf"}),
    "zip": frozenset(
        {
            "application/zip",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }
    ),
    "ole2": frozenset({"application/msword"}),
    "postscript": frozenset({"application/postscript"}),
    "text": frozenset({"text/plain"}),
}


def content_matches_declared(head: bytes, declared_mime: str | None) -> bool:
    """True when the sniffed content is supported AND consistent with the
    client-declared MIME type. Unknown/undetectable content is rejected."""
    kind = sniff_kind(head)
    if kind is None:
        return False
    allowed = _KIND_ALLOWS.get(kind, frozenset())
    if declared_mime is None:
        return True
    return declared_mime in allowed
