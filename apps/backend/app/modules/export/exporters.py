"""Citation serializers — pure functions, duck-typed on ``Exportable``.

No I/O, no DB, no ``app.*`` imports. Each function takes a list of
objects satisfying the ``Exportable`` protocol and returns a string in
the target format. Round-trip safe with the (future) ingest module's
parsers: CSV headers line up with importer aliases, BibTeX entry types
mirror the importer type map.

Self-contained: only the import paths and the ``Resource`` type
reference are module-local.
"""

from __future__ import annotations

import csv
import io
import json
import re
from collections.abc import Callable
from typing import Any, Protocol, runtime_checkable

# 序列化复用 ingest 侧同一对成熟库（pyproject 已锁定 bibtexparser 1.x /
# rispy 0.x），保证「导入↔导出」由同一实现背书，而不是两套手写逻辑互猜。
import bibtexparser
import rispy
from bibtexparser.bibdatabase import BibDatabase
from bibtexparser.bwriter import BibTexWriter

# Resource types → BibTeX entry types.
_BIBTEX_TYPE_MAP: dict[str, str] = {
    "paper": "article",
    "book": "book",
    "tutorial": "misc",
    "dataset": "misc",
}

# Resource types → RIS type_of_reference.
_RIS_TYPE_MAP: dict[str, str] = {
    "paper": "JOUR",
    "book": "BOOK",
    "tutorial": "GEN",
    "dataset": "DATA",
}

# Canonical CSV column order. Headers align with the future ingest
# module's CSV aliases so a re-import resolves every column.
_CSV_COLUMNS: list[str] = [
    "title",
    "type",
    "authors",
    "year",
    "venue",
    "discipline",
    "tags",
    "abstract",
    "doi",
    "url",
]

_KEY_SAFE_RE = re.compile(r"[^a-zA-Z0-9_-]")


@runtime_checkable
class Exportable(Protocol):
    """Structural interface — any ORM Resource or test stub satisfies this."""

    id: int | str
    title: str
    authors: list[str]
    year: int
    venue: str | None
    type: str
    discipline: str | None
    tags: list[str]
    abstract: str
    doi: str | None
    download_url: str | None
    external_url: str | None
    volume: str | None
    issue: str | None
    pages: str | None
    keywords: list[str] | None


# --- Shared helpers ---


def _author_list(resource: Exportable) -> list[str]:
    """Authors as a de-duplicated, ordered list."""
    seen: set[str] = set()
    ordered: list[str] = []
    for author in resource.authors or []:
        name = (author or "").strip()
        if name and name not in seen:
            seen.add(name)
            ordered.append(name)
    return ordered


def _tags(resource: Exportable) -> list[str]:
    return list(resource.tags or [])


def _keywords(resource: Exportable) -> list[str]:
    """Prefer explicit ``keywords``; fall back to ``tags``."""
    if resource.keywords:
        return list(resource.keywords)
    return _tags(resource)


def _url(resource: Exportable) -> str | None:
    return resource.download_url or resource.external_url or None


def _family_name(author: str) -> str:
    """Extract surname for citation key. Accepts "Family, Given" and "Given Family"."""
    if "," in author:
        return author.split(",", 1)[0].strip()
    parts = author.strip().split()
    return parts[-1] if parts else "anon"


def _citation_key(resource: Exportable, index: int) -> str:
    """Stable, BibTeX-safe key: ``<surname><year><titleword>`` (+ disambiguator)."""
    authors = _author_list(resource)
    surname = _family_name(authors[0]).lower() if authors else "anon"
    surname = _KEY_SAFE_RE.sub("", surname) or "anon"
    first_word = ""
    for word in re.split(r"\W+", resource.title or ""):
        if word and word[0].isalpha():
            first_word = word.lower()
            break
    first_word = _KEY_SAFE_RE.sub("", first_word) or "untitled"
    key = f"{surname}{resource.year}{first_word}"
    if index:
        key += f"_{index}"
    return key


# --- BibTeX ---


def _resource_to_bibtex_entry(resource: Exportable, key: str) -> dict[str, str]:
    """Build a BibDatabase entry dict (ID + ENTRYTYPE + fields)."""
    entry_type = _BIBTEX_TYPE_MAP.get(resource.type, "misc")
    authors = _author_list(resource)
    entry: dict[str, str] = {
        "ID": key,
        "ENTRYTYPE": entry_type,
        "title": resource.title or "",
        "year": str(resource.year),
    }
    if authors:
        entry["author"] = " and ".join(authors)
    if resource.venue:
        entry["journal" if resource.type == "paper" else "booktitle"] = resource.venue
    if resource.volume:
        entry["volume"] = resource.volume
    if resource.issue:
        entry["number"] = resource.issue
    if resource.pages:
        entry["pages"] = resource.pages
    keywords = _keywords(resource)
    if keywords:
        entry["keywords"] = ", ".join(keywords)
    if resource.doi:
        entry["doi"] = resource.doi
    url = _url(resource)
    if url:
        entry["url"] = url
    if resource.abstract:
        entry["abstract"] = re.sub(r"\s+", " ", resource.abstract).strip()
    return entry


def to_bibtex(resources: list[Exportable]) -> str:
    """Render resources as a BibTeX bibliography string (bibtexparser writer)."""
    used_keys: set[str] = set()
    entries: list[dict[str, str]] = []
    for i, resource in enumerate(resources):
        key = _citation_key(resource, 0)
        if key in used_keys:
            key = _citation_key(resource, i + 1)
        used_keys.add(key)
        entries.append(_resource_to_bibtex_entry(resource, key))
    db = BibDatabase()
    db.entries = entries
    writer = BibTexWriter()
    writer.indent = "  "
    return str(bibtexparser.dumps(db, writer=writer)).strip()


class _PlainRisWriter(rispy.RisWriter):  # type: ignore[misc]
    """RisWriter without the per-entry ``1.``/``2.`` numbering headers."""

    def set_header(self, count: int) -> str:
        return ""


def to_ris(resources: list[Exportable]) -> str:
    """Render resources as an RIS tagged string (rispy writer).

    Entries use rispy's canonical long key names (its writer maps them to
    tags), so exported output round-trips through ``ingest.parse_ris``
    with the same library doing both directions.
    """
    writer = _PlainRisWriter()
    blocks: list[str] = []
    for resource in resources:
        entry: dict[str, Any] = {
            "type_of_reference": _RIS_TYPE_MAP.get(resource.type, "GEN"),
            "title": resource.title,
        }
        authors = _author_list(resource)
        if authors:
            entry["authors"] = authors
        entry["year"] = str(resource.year)
        if resource.venue:
            entry["journal_name"] = resource.venue
        if resource.volume:
            entry["volume"] = resource.volume
        if resource.issue:
            entry["number"] = resource.issue
        if resource.pages:
            entry["start_page"] = resource.pages
        keywords = _keywords(resource)
        if keywords:
            entry["keywords"] = keywords
        if resource.doi:
            entry["doi"] = resource.doi
        url = _url(resource)
        if url:
            entry["urls"] = [url]
        if resource.abstract:
            entry["abstract"] = re.sub(r"\s+", " ", resource.abstract).strip()
        rendered = str(writer.formats([entry])).rstrip("\n")
        blocks.append(rendered)
    return "\n\n".join(blocks)


# --- CSV ---


def _csv_safe(value: Any) -> Any:
    """Defuse CSV formula injection.

    If a cell string starts with ``=``, ``+``, ``-``, ``@``, ``\\t`` or
    ``\\r``, prefix it with a single quote so spreadsheet apps (Excel,
    WPS) treat it as text rather than a formula.
    """
    if isinstance(value, str) and value and value[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{value}"
    return value


def to_csv(resources: list[Exportable]) -> str:
    """Render resources as CSV with canonical headers (import-round-trip safe)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
    writer.writerow(_CSV_COLUMNS)
    for resource in resources:
        writer.writerow(
            [
                _csv_safe(resource.title),
                _csv_safe(resource.type),
                _csv_safe(" and ".join(_author_list(resource))),
                resource.year,
                _csv_safe(resource.venue or ""),
                _csv_safe(resource.discipline or ""),
                _csv_safe("; ".join(_keywords(resource))),
                _csv_safe(resource.abstract or ""),
                _csv_safe(resource.doi or ""),
                _csv_safe(_url(resource) or ""),
            ]
        )
    return buffer.getvalue()


# --- JSON ---


def to_json(resources: list[Exportable]) -> str:
    """Render resources as a JSON array of normalised records."""
    records = [_resource_to_record(r) for r in resources]
    return json.dumps(records, indent=2, ensure_ascii=False)


def _resource_to_record(resource: Exportable) -> dict[str, Any]:
    return {
        "title": resource.title,
        "type": resource.type,
        "authors": _author_list(resource),
        "year": resource.year,
        "venue": resource.venue,
        "discipline": resource.discipline,
        "tags": _tags(resource),
        "abstract": resource.abstract or None,
        "doi": resource.doi,
        "external_url": _url(resource),
        "source_id": resource.id,
        "keywords": _keywords(resource),
        "volume": resource.volume,
        "issue": resource.issue,
        "pages": resource.pages,
    }


# --- Dispatch ---


EXPORTERS: dict[str, Callable[[list[Exportable]], str]] = {
    "bibtex": to_bibtex,
    "ris": to_ris,
    "csv": to_csv,
    "json": to_json,
}

MIME_TYPES: dict[str, str] = {
    "bibtex": "application/x-bibtex",
    "ris": "application/x-research-info-systems",
    "csv": "text/csv",
    "json": "application/json",
}

FILE_EXTENSIONS: dict[str, str] = {
    "bibtex": "bib",
    "ris": "ris",
    "csv": "csv",
    "json": "json",
}


def export_resources(format_: str, resources: list[Exportable]) -> str:
    """Dispatch to the right serializer by format name (case-insensitive).

    Raises ValueError on unsupported format.
    """
    fmt = format_.strip().lower()
    exporter = EXPORTERS.get(fmt)
    if exporter is None:
        raise ValueError(f"Unsupported export format: {format_!r} (bibtex/ris/csv/json)")
    return exporter(resources)


__all__ = [
    "FILE_EXTENSIONS",
    "MIME_TYPES",
    "Exportable",
    "export_resources",
    "to_bibtex",
    "to_csv",
    "to_json",
    "to_ris",
]
