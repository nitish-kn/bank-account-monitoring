from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.auth_service import create_or_update_user_from_google, generate_oauth_url, exchange_google_code, apply_permission_flags, get_login_scopes, serialize_user
from ..core.dependencies import get_current_user
from ..models.user import User
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
    """Main entrypoint in backend, Google OAuth callback endpoint. Expects a code from the frontend and creates/updates the user."""
    return create_or_update_user_from_google(code=request.code, db=db)



@router.get("/permission")
def request_permission_access(current_user: User = Depends(get_current_user)):
    """Request both email and sheets permissions"""
    scopes = get_login_scopes()
    oauth_url = generate_oauth_url(scopes, state=f"permission_{current_user.id}")
    return {"oauth_url": oauth_url}


@router.post("/permission")
def grant_permission(
    request: PermissionGrantRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Grant permissions based on the code, if not given during initial login. Handles both or partial permissions."""
    tokens = exchange_google_code(code=request.code)
    access_token = tokens['access_token']
    refresh_token = tokens.get('refresh_token')
    expires_in = tokens.get('expires_in', 3600)
    scopes = tokens.get('scope', '')
    expiry = datetime.utcnow() + timedelta(seconds=expires_in)

    current_user.access_token = access_token
    current_user.refresh_token = refresh_token or current_user.refresh_token
    current_user.token_expiry = expiry
    apply_permission_flags(current_user, scopes)

    db.commit()
    db.refresh(current_user)

    return {
        "user": serialize_user(current_user)
    }

@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
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
    Refresh JWT token. Decodes the expired JWT token without verifying expiry to retrieve user ID,
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
        
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token subject")
    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid token subject")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.refresh_token:
        raise HTTPException(status_code=401, detail="User session not found or Google refresh token missing")
        
    # Attempt to build credentials (which triggers Google OAuth refresh if credentials expired)
    try:
        creds = build_credentials(user)
        if not creds or not creds.token:
            raise HTTPException(status_code=401, detail="Failed to refresh Google session")
        user.access_token = creds.token
        if creds.expiry:
            user.token_expiry = creds.expiry
        db.commit()
    except RefreshError:
        raise HTTPException(status_code=401, detail="Google session expired. Please log in again.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Failed to refresh Google session: {str(e)}")
        
    # Generate new JWT token
    new_jwt = create_access_token(data={"sub": str(user.id)})
    return {
        "access_token": new_jwt,
        "user": serialize_user(user)
    }
