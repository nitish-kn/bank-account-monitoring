from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.dependencies import get_current_org, require_permission
from ..database import get_db
from ..models.organization import Organization
from ..services.accounts_service import get_paginated_accounts, create_new_account, get_recent_account_transactions


router = APIRouter(prefix="/api/accounts", tags=["accounts"])


class PaginationQuery(BaseModel):
    page: int = 1
    pageSize: int = 10


class SortQuery(BaseModel):
    field: Optional[str] = "account"
    order: Optional[Literal["asc", "desc"]] = "asc"


class AccountsQueryRequest(BaseModel):
    filters: dict[str, Any] = {}
    pagination: PaginationQuery = PaginationQuery()
    sort: Optional[SortQuery] = None

class CreateAccountRequest(BaseModel):
    bank: str
    accountno: str
    type: str
    name: str

@router.post("/query", dependencies=[Depends(require_permission("accounts", "view"))])
def query_accounts(
    req: AccountsQueryRequest,
    current_org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    sort_dict = req.sort.dict() if req.sort else None
    return get_paginated_accounts(
        db=db,
        org_id=current_org.id,
        filters=req.filters,
        page=req.pagination.page,
        page_size=req.pagination.pageSize,
        sort=sort_dict,
    )


@router.get("/{account_id}/transactions", dependencies=[Depends(require_permission("accounts", "view"))])
def get_account_transactions(
    account_id: str,
    limit: int = 5,
    current_org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    return get_recent_account_transactions(
        db=db,
        org_id=current_org.id,
        account_id=account_id,
        limit=limit,
    )


@router.post("/", dependencies=[Depends(require_permission("accounts", "create"))])
def create_account(request: CreateAccountRequest, current_org: Organization = Depends(get_current_org), db: Session= Depends(get_db)):

    return create_new_account(db, request, current_org.id)

    
