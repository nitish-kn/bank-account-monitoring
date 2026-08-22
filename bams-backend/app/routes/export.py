from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.dependencies import get_current_org
from ..database import get_db
from ..models.organization import Organization
from ..services.export_service import EXPORT_SOURCES, build_export, get_export_sources

router = APIRouter(prefix="/api/export", tags=["export"])

EXPORT_FORMATS = {"csv", "xlsx", "pdf"}


class ExportRequest(BaseModel):
    source: str
    format: str
    columns: list[str] = []
    # Same shape the page's own /query endpoint already receives - forwarded
    # as-is so the export reflects whatever filter is currently applied.
    filters: dict[str, Any] = {}


@router.get("/sources")
def list_export_sources():
    """Pages the "Export Data" dialog can offer, plus each page's exportable
    columns (with which ones are on by default), for the column checklist."""
    return {"sources": get_export_sources()}


@router.post("/download")
def export_data(
    req: ExportRequest,
    current_org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    if req.source not in EXPORT_SOURCES:
        raise HTTPException(status_code=400, detail=f"Unknown export source: {req.source}")
    if req.format not in EXPORT_FORMATS:
        raise HTTPException(status_code=400, detail=f"Unsupported export format: {req.format}")

    try:
        file_bytes, filename, content_type = build_export(
            db, current_org, req.source, req.format, columns=req.columns, filters=req.filters
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))

    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
