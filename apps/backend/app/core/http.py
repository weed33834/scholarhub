"""Shared HTTP client helpers for upstream API calls.

Centralises the httpx boilerplate that was repeated in every external API
caller — the ingest fetchers (Crossref, arXiv, PubMed, OpenAlex, Semantic
Scholar) and the DOI registration adapter.

Three abstraction levels, each wrapping the one below:

1. ``_request()`` — any HTTP method, transport-error translation only
   (TimeoutException/RequestError → UpstreamError). Status code handling
   is left to the caller. Used by the DOI module for POST/PUT.

2. ``_get_response()`` — GET-only convenience wrapper over ``_request``.
   Used by the DOI module's ``get_doi_metadata``.

3. ``fetch_json()`` / ``fetch_xml()`` — GET + transport errors + 404/4xx/5xx
   raise + body parsing. Used by the 5 ingest fetchers.

Exceptions are defined here so every caller shares one vocabulary. Callers
may re-export ``ResourceNotFoundError`` / ``UpstreamError`` for backward
compatibility.
"""

from __future__ import annotations

import logging
from typing import Any, cast

import httpx
from defusedxml import ElementTree as ET  # type: ignore[import-untyped]

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 10.0


class ResourceNotFoundError(RuntimeError):
    """Upstream reports the requested resource does not exist."""


class UpstreamError(RuntimeError):
    """Upstream timed out, returned 4xx/5xx, or sent unparseable data."""


async def _request(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    json: Any = None,
    timeout: float = DEFAULT_TIMEOUT,  # noqa: ASYNC109 - passed to httpx, not asyncio.timeout
) -> httpx.Response:
    """HTTP request with transport-error translation.

    Raises ``UpstreamError`` on timeout or connection error. Status code
    handling is the caller's responsibility.
    """
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            return await client.request(method, url, headers=headers, json=json)
    except httpx.TimeoutException as exc:
        raise UpstreamError(f"Timeout: {exc}") from exc
    except httpx.RequestError as exc:
        raise UpstreamError(f"Request failed: {exc}") from exc


async def _get_response(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT,  # noqa: ASYNC109 - passed to httpx, not asyncio.timeout
) -> httpx.Response:
    """GET convenience wrapper over ``_request``."""
    return await _request("GET", url, headers=headers, timeout=timeout)


async def fetch_json(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT,  # noqa: ASYNC109 - passed to httpx, not asyncio.timeout
) -> dict[str, Any]:
    """GET ``url`` and parse the JSON response body.

    Raises ``ResourceNotFoundError`` on 404 and ``UpstreamError`` on any
    other transport / HTTP / parse failure.
    """
    resp = await _get_response(url, headers=headers, timeout=timeout)
    if resp.status_code == 404:
        raise ResourceNotFoundError(f"Resource not found: {url}")
    if resp.status_code >= 400:
        raise UpstreamError(f"HTTP {resp.status_code} for {url}")
    try:
        return cast("dict[str, Any]", resp.json())
    except ValueError as exc:
        raise UpstreamError(f"Non-JSON response: {exc}") from exc


async def fetch_xml(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT,  # noqa: ASYNC109 - passed to httpx, not asyncio.timeout
) -> ET.Element:
    """GET ``url`` and parse the XML response body.

    Raises ``ResourceNotFoundError`` on 404 and ``UpstreamError`` on any
    other transport / HTTP / parse failure.
    """
    resp = await _get_response(url, headers=headers, timeout=timeout)
    if resp.status_code == 404:
        raise ResourceNotFoundError(f"Resource not found: {url}")
    if resp.status_code >= 400:
        raise UpstreamError(f"HTTP {resp.status_code} for {url}")
    try:
        return ET.fromstring(resp.text)
    except ET.ParseError as exc:
        raise UpstreamError(f"Invalid XML: {exc}") from exc
