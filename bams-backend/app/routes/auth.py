from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.auth_service import (
    build_session_payload,
    create_or_update_org_from_google,
    generate_oauth_url,
    exchange_google_code,
    apply_permission_flags,
    get_login_scopes,
    login_with_password,
    serialize_org,
)
from ..services.rbac_service import get_user_permissions
from ..core.dependencies import get_current_org, get_current_user
from ..models.organization import Organization
from ..models.users import User
from ..utils.serializers import serialize_user
from pydantic import BaseModel
from ..core.auth import verify_token_ignore_expiry, create_access_token
from ..core.dependencies import TOKEN_TYPE
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


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/google")
def google_auth(request: GoogleAuthRequest, db: Session = Depends(get_db)):
    """Main entrypoint in backend, Google OAuth callback endpoint. Expects a code from the frontend and creates/updates the org."""
    return create_or_update_org_from_google(code=request.code, db=db)


@router.post("/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Email/password sign-in for sub-users created by an admin."""
    return login_with_password(request.email, request.password, db)


@router.get("/me")
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Current identity plus permissions -- the frontend re-reads this on load
    so a role change takes effect without waiting for the token to expire."""
    return {
        "org": serialize_org(current_user.organization),
        "user": serialize_user(current_user),
        "permissions": sorted(get_user_permissions(db, current_user)),
    }


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
        
    if payload.get("typ") != TOKEN_TYPE:
        raise HTTPException(status_code=401, detail="Invalid token subject")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token subject")
    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid token subject")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Session not found")

    org = user.organization
    if not org:
        raise HTTPException(status_code=401, detail="Session not found")

    # Only the Google-linked owner has Google credentials to refresh; sub-users
    # sign in with a password, so their session just gets a fresh JWT.
    if org.refresh_token and user.password_hash is None:
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

    return build_session_payload(db, user)
