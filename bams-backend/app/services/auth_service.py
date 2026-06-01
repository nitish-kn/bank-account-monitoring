from datetime import datetime, timedelta, timezone
import requests
from urllib.parse import urlencode
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
from ..config import settings
from ..models.user import User
from ..core.auth import create_access_token


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
    """Fetch user information from Google using the access token"""
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


def apply_permission_flags(user: User, scope: str | list[str]) -> None:
    """Set user's permission flags based on the scopes returned from Google"""
    
    if isinstance(scope, str):
        scope = scope.split()

    user.has_email_permissions = (user.has_email_permissions or 'https://www.googleapis.com/auth/gmail.readonly' in scope)
    user.has_sheets_permissions = (user.has_sheets_permissions or any(
        s in scope
        for s in ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/spreadsheets']
    ))


def _serialize_datetime(value: datetime | None) -> str | None:
    if not value:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc).isoformat()
    return value.astimezone(timezone.utc).isoformat()


def serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "has_email_permissions": user.has_email_permissions,
        "has_sheets_permissions": user.has_sheets_permissions,
        "is_setup_completed": user.is_setup_completed,
        "spreadsheet_id": user.spreadsheet_id,
        "last_synced_at": _serialize_datetime(user.last_synced_at),
        "last_synced_status": user.last_synced_status,
        "last_synced_email_date": _serialize_datetime(user.last_synced_email_date),
    }


def create_or_update_user_from_google(code: str, db: Session) -> dict:
    """Create or update a user in the database based on Google OAuth code and return user info and JWT token"""

    # Exchange code for tokens and get user info from Google
    tokens = exchange_google_code(code)
    access_token = tokens['access_token']
    refresh_token = tokens.get('refresh_token')
    expires_in = tokens.get('expires_in', 3600)
    scopes = tokens.get('scope', '')

    # Fetch user info from Google using the access token
    user_info = fetch_google_user_info(access_token)
    google_id = user_info['id']
    email = user_info['email']
    name = user_info.get('name')
    picture = user_info.get('picture')

    # Check if user exists in the database
    user = db.query(User).filter(User.google_id == google_id).first()
    expiry = datetime.utcnow() + timedelta(seconds=expires_in)

    # If user exists, update tokens and permissions. Otherwise, create a new user.
    if user:
        user.access_token = access_token
        user.refresh_token = refresh_token or user.refresh_token
        user.token_expiry = expiry
    else:
        user = User(
            google_id=google_id,
            email=email,
            name=name,
            picture=picture,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expiry=expiry,
        )
        db.add(user)

    # Apply permission flags based on the scopes returned from Google
    apply_permission_flags(user, scopes)
    db.commit()
    db.refresh(user)

    jwt_token = create_access_token(data={"sub": str(user.id)})
    return {
        "user": serialize_user(user),
        "access_token": jwt_token,
    }


def update_user_permissions_from_code(code: str, permission_type: str, user: User, db: Session) -> User:
    """Update user's permissions based on the authorization code returned from Google after requesting additional permissions"""
    tokens = exchange_google_code(code)
    access_token = tokens['access_token']
    refresh_token = tokens.get('refresh_token')
    expires_in = tokens.get('expires_in', 3600)
    scopes = tokens.get('scope', '')
    expiry = datetime.utcnow() + timedelta(seconds=expires_in)

    user.access_token = access_token
    user.refresh_token = refresh_token or user.refresh_token
    user.token_expiry = expiry
    apply_permission_flags(user, scopes)

    if permission_type == 'gmail':
        user.has_email_permissions = True
    if permission_type == 'sheets':
        user.has_sheets_permissions = True

    db.commit()
    db.refresh(user)
    return user
