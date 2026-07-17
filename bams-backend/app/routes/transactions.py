from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Any

from ..core.dependencies import get_current_user
from ..database import get_db
from ..models.user import User
from ..services.transaction_service import get_paginated_transactions, get_dashboard_summary, get_filter_options

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

class PaginationQuery(BaseModel):
    page: int = 1
    pageSize: int = 50

class IncludeQuery(BaseModel):
    transactions: bool = True
    summary: bool = False

class TransactionQueryRequest(BaseModel):
    filters: dict[str, Any] = {}
    pagination: PaginationQuery = PaginationQuery()
    include: IncludeQuery = IncludeQuery()

@router.get("/filter-options")
def get_options(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_filter_options(db, current_user.id)

@router.post("/query")
def query_transactions(req: TransactionQueryRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = {}
    if req.include.transactions:
        paginated = get_paginated_transactions(db, current_user.id, req.filters, req.pagination.page, req.pagination.pageSize)
        result["transactions"] = paginated["data"]
        result["totalCount"] = paginated["totalCount"]
        
    if req.include.summary:
        result["summary"] = get_dashboard_summary(db, current_user.id, req.filters)
        
    return result
