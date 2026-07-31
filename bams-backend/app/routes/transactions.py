from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Any, Literal

from ..core.dependencies import get_current_user
from ..database import get_db
from ..models.user import User
from ..services.transaction_service import get_paginated_transactions, get_dashboard_summary, get_filter_options
from fastapi import Request
from ..services.transaction_service import update_transaction, query_audit_logs

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

class PaginationQuery(BaseModel):
    page: int = 1
    pageSize: int = 50

class IncludeQuery(BaseModel):
    transactions: bool = True
    summary: bool = False

class SortQuery(BaseModel):
    field: Optional[str] = None
    order: Optional[Literal["asc", "desc"]] = "desc"

class TransactionQueryRequest(BaseModel):
    filters: dict[str, Any] = {}
    pagination: PaginationQuery = PaginationQuery()
    sort: Optional[SortQuery] = None
    include: IncludeQuery = IncludeQuery()

@router.get("/filter-options")
def get_options(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_filter_options(db, current_user.id)

@router.post("/query")
def query_transactions(req: TransactionQueryRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = {}
    if req.include.transactions:
        sort_dict = req.sort.dict() if req.sort else None
        paginated = get_paginated_transactions(db, current_user.id, req.filters, req.pagination.page, req.pagination.pageSize, sort_dict)
        result["transactions"] = paginated["data"]
        result["totalCount"] = paginated["totalCount"]
        
    if req.include.summary:
        result["summary"] = get_dashboard_summary(db, current_user.id, req.filters)
        
    return result


class EditTransactionRequest(BaseModel):
    category: Optional[str] = None
    narration: Optional[str] = None
    counterparty: Optional[str] = None
    account_number: Optional[str] = None
    account_holder_name: Optional[str] = None
    txn_date: Optional[str] = None
    mode: Optional[str] = None
    ref_number: Optional[str] = None
    changed_by: str
    reason: Optional[str] = None


@router.put("/{id}")
def edit_transaction(
    id: str,
    payload: EditTransactionRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ip_address = request.client.host if request.client else "unknown"
    return update_transaction(
        db=db,
        user_id=current_user.id,
        txn_id=id,
        payload=payload,
        ip_address=ip_address
    )

@router.get("/audit-log")
def get_audit_log(
    page: int = 1,
    pageSize: int = 50,
    search: Optional[str] = None,
    changed_by: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return query_audit_logs(
        db=db,
        user_id=current_user.id,
        page=page,
        page_size=pageSize,
        search=search,
        changed_by=changed_by,
        start_date=start_date,
        end_date=end_date
    )
