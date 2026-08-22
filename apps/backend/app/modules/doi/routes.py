"""DOI API routes — ``POST /api/doi/register`` and ``GET /api/doi/{resource_id}/status``.

Both endpoints require authentication (admin/editor role for registration,
any authenticated user for status check).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin, require_tenant_id
from app.core.db import get_db
from app.core.time import utcnow
from app.models import User
from app.modules.catalog.models import Resource
from app.modules.doi.models import DOIRegistration
from app.modules.doi.registration import datacite_enabled, mint_doi
from app.modules.doi.schemas import (
    DOIRegisterRequest,
    DOIRegistrationResponse,
    DOIStatusResponse,
)

router = APIRouter(prefix="/doi", tags=["doi"])


@router.post("/register", response_model=DOIRegistrationResponse)
async def register_doi(
    payload: DOIRegisterRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> DOIRegistrationResponse:
    """Mint a new DOI for a catalog resource.

    Requires admin/editor role. Uses DataCite API to register the DOI.
    """
    if not datacite_enabled():
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="DOI registration is not configured. Set SCHOLARHUB_DATACITE_API_URL and SCHOLARHUB_DATACITE_PREFIX.",
        )

    tenant_id = require_tenant_id()

    # Fetch the resource and validate it exists
    stmt = select(Resource).where(
        Resource.id == payload.resource_id,
        Resource.tenant_id == tenant_id,
    )
    result = await db.execute(stmt)
    resource = result.scalar_one_or_none()
    if resource is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resource {payload.resource_id} not found in this tenant.",
        )

    # Check if a DOI already exists for this resource
    if resource.doi:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Resource {payload.resource_id} already has a DOI: {resource.doi}",
        )

    # Mint the DOI via DataCite
    doi, state = await mint_doi(resource, suffix=payload.doi_suffix)

    # Record the registration event in the local audit table
    registration = DOIRegistration(
        tenant_id=tenant_id,
        resource_id=resource.id,
        doi=doi,
        state=state,
        message=None,
        registered_by=current_user.id,
        created_at=utcnow(),
    )
    db.add(registration)

    # If minting succeeded, update the resource's DOI column
    if state == "completed":
        resource.doi = doi

    await db.commit()
    await db.refresh(registration)

    return DOIRegistrationResponse(
        id=registration.id,
        resource_id=registration.resource_id,
        doi=registration.doi,
        state=registration.state,
        message=registration.message,
        created_at=registration.created_at,
    )


@router.get("/{resource_id}/status", response_model=DOIStatusResponse)
async def doi_status(
    resource_id: int,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DOIStatusResponse:
    """Check the DOI registration status for a resource."""
    tenant_id = require_tenant_id()

    # Check if the resource has a DOI column set
    resource_stmt = select(Resource).where(
        Resource.id == resource_id,
        Resource.tenant_id == tenant_id,
    )
    resource_result = await db.execute(resource_stmt)
    resource = resource_result.scalar_one_or_none()
    if resource is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resource {resource_id} not found in this tenant.",
        )

    # Fetch the latest registration record
    reg_stmt = (
        select(DOIRegistration)
        .where(
            DOIRegistration.resource_id == resource_id,
            DOIRegistration.tenant_id == tenant_id,
        )
        .order_by(DOIRegistration.created_at.desc())
        .limit(1)
    )
    reg_result = await db.execute(reg_stmt)
    registration = reg_result.scalar_one_or_none()

    if registration is None:
        return DOIStatusResponse(
            doi=resource.doi,
            state="none",
            registered_at=None,
            message=None,
        )

    return DOIStatusResponse(
        doi=registration.doi,
        state=registration.state,
        registered_at=registration.created_at,
        message=registration.message,
    )


@router.get("/config", response_model=dict[str, Any])
async def doi_config(
    _: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Return the DOI configuration status (whether DataCite is enabled)."""
    from app.core.config import get_settings

    return {
        "enabled": datacite_enabled(),
        "prefix": get_settings().datacite_prefix or "not configured",
    }


__all__ = ["router"]
