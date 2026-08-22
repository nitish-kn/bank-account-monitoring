from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.auth_service import create_or_update_org_from_google, generate_oauth_url, exchange_google_code, apply_permission_flags, get_login_scopes, serialize_org
from ..core.dependencies import get_current_org
from ..models.organization import Organization
from pydantic import BaseModel
from ..core.auth import verify_token_ignore_expiry, create_access_token
from ..services.credentials import build_credentials
from google.auth.exceptions import RefreshError
import time

router = APIRouter(prefix="/api/auth", tags=["authentication"])


class GoogleAuthRequest(BaseModel):
    code: str

class PermissionGrantRequest(BaseModel):
    code: str


class RefreshRequest(BaseModel):
    token: str


@router.post("/google")
def google_auth(request: GoogleAuthRequest, db: Session = Depends(get_db)):
    """Main entrypoint in backend, Google OAuth callback endpoint. Expects a code from the frontend and creates/updates the org."""
    return create_or_update_org_from_google(code=request.code, db=db)


@router.get("/permission")
def request_permission_access(current_org: Organization = Depends(get_current_org)):
    """Request both email and sheets permissions"""
    scopes = get_login_scopes()
    oauth_url = generate_oauth_url(scopes, state=f"permission_{current_org.id}")
    return {"oauth_url": oauth_url}


@router.post("/permission")
def grant_permission(
    request: PermissionGrantRequest,
    current_org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Grant permissions based on the code, if not given during initial login. Handles both or partial permissions."""
    tokens = exchange_google_code(code=request.code)
    access_token = tokens['access_token']
    refresh_token = tokens.get('refresh_token')
    expires_in = tokens.get('expires_in', 3600)
    scopes = tokens.get('scope', '')
    expiry = datetime.utcnow() + timedelta(seconds=expires_in)

    current_org.access_token = access_token
    current_org.refresh_token = refresh_token or current_org.refresh_token
    current_org.token_expiry = expiry
    apply_permission_flags(current_org, scopes)

    db.commit()
    db.refresh(current_org)

    return {
        "org": serialize_org(current_org)
    }


@router.post("/logout")
def logout(current_org: Organization = Depends(get_current_org)):
    """
    Logout endpoint - validates JWT token and confirms logout.
    Frontend handles clearing cookies and localStorage.
    """
    return {
        "message": "Logged out successfully",
        "status": "success"
    }


@router.post("/refresh")
def refresh_token(request: RefreshRequest, db: Session = Depends(get_db)):
    """
    Refresh JWT token. Decodes the expired JWT token without verifying expiry to retrieve org ID,
    checks if they have a Google refresh token, verifies it, and issues a new JWT.
    """

    
    payload = verify_token_ignore_expiry(request.token)
    if not payload or not isinstance(payload, dict):
        raise HTTPException(status_code=401, detail="Invalid token structure")
        
    # Security check: limit the token refresh eligibility window to 7 days after expiry
    exp = payload.get("exp")
    if exp is None or not isinstance(exp, (int, float)):
        raise HTTPException(status_code=401, detail="Invalid or missing token expiry")
    if (time.time() - exp) > 7 * 86400:
        raise HTTPException(status_code=401, detail="Session expired too long ago. Please log in again.")
        
    org_id = payload.get("sub")
    if not org_id:
        raise HTTPException(status_code=401, detail="Invalid token subject")
    try:
        org_id = int(org_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid token subject")
        
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org or not org.refresh_token:
        raise HTTPException(status_code=401, detail="Organization session not found or Google refresh token missing")
        
    # Attempt to build credentials (which triggers Google OAuth refresh if credentials expired)
    try:
        creds = build_credentials(org)
        if not creds or not creds.token:
            raise HTTPException(status_code=401, detail="Failed to refresh Google session")
        org.access_token = creds.token
        if creds.expiry:
            org.token_expiry = creds.expiry
        db.commit()
    except RefreshError:
        raise HTTPException(status_code=401, detail="Google session expired. Please log in again.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Failed to refresh Google session: {str(e)}")
        
    # Generate new JWT token
    new_jwt = create_access_token(data={"sub": str(org.id)})
    return {
        "access_token": new_jwt,
        "org": serialize_org(org)
    }
