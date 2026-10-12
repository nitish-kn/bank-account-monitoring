import base64
import binascii
from datetime import date
from decimal import Decimal
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.dependencies import get_current_org, require_permission
from ..database import get_db
from ..models.organization import Organization
from ..services.tally_service import (
    TALLY_NOT_CONNECTED, TallyBridgeError, _call_bridge, get_companies, get_ledgers, import_vouchers,
    push_transactions,
)

router = APIRouter(
    prefix="/api/tally",
    tags=["tally"],
    dependencies=[Depends(require_permission("export_data", "trigger"))],
)


def bridge_http_error(err: TallyBridgeError) -> HTTPException:
    return HTTPException(status_code=503 if err.not_connected else 502, detail=str(err))


class TallyPushItem(BaseModel):
    id: str
    company: str
    debit_ledger: str
    credit_ledger: str
    voucher_type: str
    narration: str | None = None


class TallyPushRequest(BaseModel):
    items: list[TallyPushItem]


def tally_credentials(x_tally_authorization: str = Header()):
    try:
        scheme, encoded = x_tally_authorization.split(" ", 1)
        username, password = base64.b64decode(encoded, validate=True).decode("utf-8").split(":", 1)
        if scheme.lower() != "basic" or not username.strip() or not password:
            raise ValueError()
        return username, password
    except (ValueError, UnicodeDecodeError, binascii.Error):
        raise HTTPException(status_code=400, detail="Configure a valid Tally username and password.")


class TallyLedgerRequest(BaseModel):
    name: str
    parent: str
    openingBalance: Decimal | None = None


@router.get("/health")
def tally_health(x_tally_authorization: str | None = Header(default=None)):
    try:
        if x_tally_authorization:
            # With the user's credentials, a real masters request checks Tally and the credentials together.
            get_ledgers(tally_credentials(x_tally_authorization))
        elif not _call_bridge("GET", "/health").get("tallyRunning"):
            raise TallyBridgeError(TALLY_NOT_CONNECTED, not_connected=True)
        return {"status": "connected", "tallyRunning": True}
    except TallyBridgeError as err:
        raise bridge_http_error(err)


@router.get("/groups")
def list_groups(auth=Depends(tally_credentials)):
    try:
        return _call_bridge("GET", "/groups", auth=auth)
    except TallyBridgeError as err:
        raise bridge_http_error(err)


@router.post("/ledgers")
def create_ledger(req: TallyLedgerRequest, auth=Depends(tally_credentials)):
    if not req.name.strip() or not req.parent.strip():
        raise HTTPException(status_code=400, detail="Ledger name and Under Group are required.")
    body = {"name": escape(req.name.strip(), {'"': '&quot;'}), "parent": escape(req.parent.strip())}
    if req.openingBalance is not None:
        if not req.openingBalance.is_finite():
            raise HTTPException(status_code=400, detail="Opening balance must be a finite number.")
        body["openingBalance"] = str(req.openingBalance)
    try:
        result = _call_bridge("POST", "/ledgers", auth=auth, json=body)
        if not result.get("created"):
            raise TallyBridgeError("Tally did not create the ledger.")
        return result
    except TallyBridgeError as err:
        raise bridge_http_error(err)


@router.get("/ledgers")
def list_ledgers(auth=Depends(tally_credentials)):
    try:
        return {"ledgers": get_ledgers(auth)}
    except TallyBridgeError as err:
        raise bridge_http_error(err)


@router.get("/companies")
def list_companies(auth=Depends(tally_credentials)):
    try:
        return {"companies": get_companies(auth)}
    except TallyBridgeError as err:
        raise bridge_http_error(err)


class TallyImportRequest(BaseModel):
    from_date: date
    to_date: date


@router.post("/import")
def import_from_tally(
    req: TallyImportRequest,
    current_org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
    auth=Depends(tally_credentials),
):
    if req.from_date > req.to_date:
        raise HTTPException(status_code=400, detail="The start date must be on or before the end date.")
    try:
        return import_vouchers(db, current_org.id, req.from_date, req.to_date, auth)
    except TallyBridgeError as err:
        raise bridge_http_error(err)


@router.post("/push")
def push_to_tally(
    req: TallyPushRequest,
    current_org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
    auth=Depends(tally_credentials),
):
    return {"results": push_transactions(db, current_org.id, req.items, auth)}
