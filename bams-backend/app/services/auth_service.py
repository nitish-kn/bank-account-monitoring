from datetime import datetime, timedelta, timezone
import requests
from urllib.parse import urlencode
# pyrefly: ignore [missing-import]
from fastapi import HTTPException
from sqlalchemy.orm import Session
from ..config import settings
from ..core.dependencies import TOKEN_TYPE
from ..core.security import verify_password
from ..models.organization import Organization
from ..models.users import User
from ..core.auth import create_access_token
from .rbac_service import ensure_super_admin, get_user_permissions
from ..utils.serializers import serialize_auth_org as serialize_org, serialize_user


def build_session_payload(db: Session, user: User) -> dict:
    """The shape every authenticating endpoint returns: a token plus enough
    identity/permission context for the frontend to render the right UI."""
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return {
        "access_token": create_access_token(data={"sub": str(user.id), "typ": TOKEN_TYPE}),
        "org": serialize_org(user.organization),
        "user": serialize_user(user),
        "permissions": sorted(get_user_permissions(db, user)),
    }


def generate_oauth_url(scopes: list[str], state: str = None) -> str:
    """Generate Google OAuth URL with specified scopes """
    base_url = "https://accounts.google.com/o/oauth2/v2/auth"
    params = {
        'client_id': settings.google_client_id,
        'redirect_uri': 'postmessage',
        'response_type': 'code',
        'scope': ' '.join(scopes),
        'access_type': 'offline',
        'prompt': 'consent',
    }
    if state:
        params['state'] = state

    return f"{base_url}?{urlencode(params)}"


def exchange_google_code(code: str) -> dict:
    """ Exchange authorization code for access and refresh tokens """
    data = {
        'client_id': settings.google_client_id,
        'client_secret': settings.google_client_secret,
        'code': code,
        'grant_type': 'authorization_code',
        'redirect_uri': 'postmessage',
    }
    response = requests.post('https://oauth2.googleapis.com/token', data=data)
    response.raise_for_status()
    return response.json()


def fetch_google_user_info(access_token: str) -> dict:
    """Fetch org information from Google using the access token"""
    headers = {'Authorization': f'Bearer {access_token}'}
    response = requests.get('https://www.googleapis.com/oauth2/v2/userinfo', headers=headers)
    response.raise_for_status()
    return response.json()


def get_login_scopes() -> list[str]:
    """Get both email and sheets scopes for login"""
    return [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/spreadsheets',
    ]


def permission_scopes(permission_type: str) -> list[str]:
    """Get scopes for a specific permission type"""
    if permission_type == 'gmail':
        return ['https://www.googleapis.com/auth/gmail.readonly']
    if permission_type == 'sheets':
        return [
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/spreadsheets',
        ]
    raise ValueError('permission_type must be gmail or sheets')


def apply_permission_flags(org: Organization, scope: str | list[str]) -> None:
    """Set org's permission flags based on the scopes returned from Google"""
    
    if isinstance(scope, str):
        scope = scope.split()

    org.has_email_permissions = (org.has_email_permissions or 'https://www.googleapis.com/auth/gmail.readonly' in scope)
    org.has_sheets_permissions = (org.has_sheets_permissions or any(
        s in scope
        for s in ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/spreadsheets']
    ))


def create_or_update_org_from_google(code: str, db: Session) -> dict:
    """Create or update an org in the database based on Google OAuth code and return org info and JWT token"""

    # Exchange code for tokens and get org info from Google
    tokens = exchange_google_code(code)
    access_token = tokens['access_token']
    refresh_token = tokens.get('refresh_token')
    expires_in = tokens.get('expires_in', 3600)
    scopes = tokens.get('scope', '')

    # Fetch org info from Google using the access token
    user_info = fetch_google_user_info(access_token)
    google_id = user_info['id']
    email = user_info['email']
    name = user_info.get('name')
    picture = user_info.get('picture')

    # Check if org exists in the database
    org = db.query(Organization).filter(Organization.google_id == google_id).first()
    expiry = datetime.utcnow() + timedelta(seconds=expires_in)

    # If org exists, update tokens and permissions. Otherwise, create a new org.
    if org:
        org.access_token = access_token
        org.refresh_token = refresh_token or org.refresh_token
        org.token_expiry = expiry
    else:
        org = Organization(
            google_id=google_id,
            email=email,
            name=name,
            picture=picture,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expiry=expiry,
        )
        db.add(org)

    # Apply permission flags based on the scopes returned from Google
    apply_permission_flags(org, scopes)
    db.flush()  # a brand-new org needs its id before roles/users can point at it

    # Signing in with Google always lands you as this org's super admin.
    user = ensure_super_admin(db, org)
    db.commit()
    db.refresh(org)

    return build_session_payload(db, user)


def login_with_password(email: str, password: str, db: Session) -> dict:
    """Email/password sign-in for sub-users an admin created."""
    credentials_exception = HTTPException(status_code=401, detail="Incorrect email or password.")

    user = db.query(User).filter(User.email == email.strip().lower()).first()
    if user is None or not verify_password(password, user.password_hash):
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been deactivated.")

    return build_session_payload(db, user)


def update_org_permissions_from_code(code: str, permission_type: str, org: Organization, db: Session) -> Organization:
    """Update org's permissions based on the authorization code returned from Google after requesting additional permissions"""
    tokens = exchange_google_code(code)
    access_token = tokens['access_token']
    refresh_token = tokens.get('refresh_token')
    expires_in = tokens.get('expires_in', 3600)
    scopes = tokens.get('scope', '')
    expiry = datetime.utcnow() + timedelta(seconds=expires_in)

    org.access_token = access_token
    org.refresh_token = refresh_token or org.refresh_token
    org.token_expiry = expiry
    apply_permission_flags(org, scopes)

    if permission_type == 'gmail':
        org.has_email_permissions = True
    if permission_type == 'sheets':
        org.has_sheets_permissions = True

    db.commit()
    db.refresh(org)
    return org
