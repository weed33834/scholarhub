"""FastAPI application entrypoint.

Composes: lifespan (DB + modules) → middleware (tenant, security, CORS) →
core routers → module routers.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_fixed,
)

from app import __version__
from app.api import (
    admin,
    auth,
    gdpr,
    health,
    metrics,
    modules,
    privacy,
    tenant_hosts,
    users,
    webauthn,
)
from app.api.oidc import router as oidc_router
from app.core.bootstrap import run_bootstrap
from app.core.config import settings
from app.core.db import check_db_connection, dispose_engine
from app.core.logging import configure_logging, get_logger
from app.core.modules import load_all, registry
from app.core.monitoring import init_monitoring
from app.core.tenant import TenantContextMiddleware
from app.middleware.csrf import CSRFMiddleware
from app.middleware.metrics import HTTPMetricsMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware

configure_logging()
logger = get_logger("scholarhub.startup")

# Sentry must be initialised before the FastAPI app is constructed so its
# auto-instrumentation can wrap the ASGI app. No-op when DSN is unset.
init_monitoring()


@retry(
    stop=stop_after_attempt(settings.db_startup_retries + 1),
    wait=wait_fixed(settings.db_startup_retry_delay),
    retry=retry_if_exception_type(Exception),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
async def _verify_db_with_retry() -> None:
    """Verify DB connectivity; tenacity retries up to ``db_startup_retries`` times."""
    await check_db_connection()
    logger.info("database_connection_verified")


# Load enabled modules eagerly so their routers are available when the
# app is constructed. Module __init__ only registers manifests (no I/O),
# so this is safe to run at import time.
load_all()
logger.info(
    "modules_loaded",
    count=len(registry),
    names=[m for m in registry.all_metadata()],
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan: verify DB → bootstrap → yield → dispose."""
    if not settings.is_test:
        await _verify_db_with_retry()
        await run_bootstrap()

    yield

    if not settings.is_test:
        await dispose_engine()
        logger.info("database_engine_disposed")


app = FastAPI(
    title=settings.app_name,
    version=__version__,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    openapi_url="/openapi.json" if not settings.is_production else None,
    lifespan=lifespan,
)


# --- Exception handlers ---


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    from app.core.tenant import REQUEST_ID_CTX

    request_id = REQUEST_ID_CTX.get()
    errors = []
    for err in exc.errors():
        loc = ".".join(str(part) for part in err.get("loc", []))
        errors.append(
            {
                "field": loc,
                "message": err.get("msg", "Invalid value"),
                "type": err.get("type", "value_error"),
            }
        )
    return JSONResponse(
        status_code=422,
        content={
            "status": 422,
            "title": "Validation error",
            "type": "https://httpstatuses.org/422",
            "instance": str(request.url.path),
            "detail": "Validation error",
            "errors": errors,
            "trace_id": request_id or "",
        },
        headers={"Content-Type": "application/problem+json"},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    from app.core.tenant import REQUEST_ID_CTX

    request_id = REQUEST_ID_CTX.get()
    exc_headers = exc.headers or {}
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": exc.status_code,
            "title": "HTTP error",
            "type": f"https://httpstatuses.org/http-{exc.status_code}",
            "instance": str(request.url.path),
            "detail": exc.detail,
            "trace_id": request_id or "",
        },
        headers={
            **exc_headers,
            "Content-Type": "application/problem+json",
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch all unhandled exceptions; never leak stack traces to clients."""
    from app.core.tenant import REQUEST_ID_CTX

    request_id = REQUEST_ID_CTX.get()
    logger.error(
        "unhandled_exception",
        method=request.method,
        path=request.url.path,
        request_id=request_id,
        error=str(exc),
        exc_info=True,
    )
    detail = "Internal server error"
    if settings.debug:
        detail = f"{type(exc).__name__}: {exc}"
    return JSONResponse(status_code=500, content={"detail": detail})


# --- Middleware stack (note: FastAPI is LIFO — last added runs first) ---
#
# Execution order on inbound request (registered here bottom-up):
#   1. TenantContextMiddleware   (resolves tenant, sets request_id)
#   2. RateLimitMiddleware        (per-IP + per-auth-path throttling)
#   3. SecurityHeadersMiddleware (CSP, X-Frame, X-API-Version)
#   4. CORSMiddleware
#   5. TrustedHostMiddleware (production only)
# Tenant MUST run before auth, because auth depends on tenant scope.
app.add_middleware(CSRFMiddleware)
app.add_middleware(RateLimitMiddleware, default_per_minute=settings.rate_limit_per_minute)
app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=settings.cors_methods,
    allow_headers=settings.cors_headers,
)

if settings.is_production:
    from fastapi.middleware.trustedhost import TrustedHostMiddleware

    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts_list)

# Tenant must be outermost — register LAST so it runs first.
app.add_middleware(TenantContextMiddleware)

# HTTP metrics middleware — registers AFTER tenant so scope["route"] is
# populated by FastAPI's router, but before the app processes the request.
app.add_middleware(HTTPMetricsMiddleware)


# --- Core routers (always present) ---
# Health probes at root (Kubernetes convention) + legacy at /api prefix.
app.include_router(health.router)
app.include_router(health.legacy_router, prefix="/api")
# Metrics at root for Prometheus scrapers.
app.include_router(metrics.router)
# All other core routers under /api.
# Privacy is also mounted at root so it's accessible without /api prefix.
app.include_router(privacy.router)
app.include_router(privacy.router, prefix="/api")
app.include_router(gdpr.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(tenant_hosts.router, prefix="/api")
app.include_router(modules.router, prefix="/api")
# WebAuthn / Passkeys as an alternative to TOTP 2FA.
app.include_router(webauthn.router, prefix="/api")
# OIDC routes always mount; each endpoint 503s when OIDC is not configured
# (default). This avoids a shape change when an operator flips the env flag.
app.include_router(oidc_router, prefix="/api")


# --- Module routers (loaded dynamically at startup) ---
for name, module_router in registry.all_routers():
    app.include_router(module_router, prefix="/api")
    logger.info("module_router_mounted", module=name, prefix=f"/api/{name}")


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "name": "ScholarHUB API",
        "version": __version__,
        "docs": "/docs",
    }
