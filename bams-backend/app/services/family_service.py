from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from ..models.family import Family
from ..models.user import User
from ..utils.email_utils import email_timestamp, parse_sheet_email_row
from ..utils.serializers import serialize_family, serialize_family_member
from .credentials import build_credentials
from ..utils.sheets_utils import _get_sheet_title


def get_family_members_for_user(current_user: User, db: Session) -> dict:
    if not current_user.family_id:
        return {
            "family": None,
            "members": [],
        }

    family = db.query(Family).filter(Family.id == current_user.family_id).first()
    members = (
        db.query(User)
        .filter(User.family_id == current_user.family_id)
        .order_by(User.name.asc(), User.email.asc())
        .all()
    )

    return {
        "family": serialize_family(family),
        "members": [serialize_family_member(member) for member in members],
    }


def _parse_sheet_row_to_email(row: list[str], member: User) -> dict | None:
    """Parse a sheet row into email format and tag with member info."""
    return parse_sheet_email_row(row, {
        "member_id": member.id,
        "member_name": member.name or member.email,
        "member_email": member.email,
        "member_picture": member.picture,
    })


def _read_member_sheet_data(member: User) -> list[dict]:
    """Read email data from a family member's Google Sheet."""
    if not member.is_setup_completed or not member.spreadsheet_id:
        return []
    
    try:
        credentials = build_credentials(member)
        sheets_service = build("sheets", "v4", credentials=credentials)
        
        sheet_title = _get_sheet_title(sheets_service, member.spreadsheet_id)
        
        result = sheets_service.spreadsheets().values().get(
            spreadsheetId=member.spreadsheet_id,
            range=f"'{sheet_title}'!A2:F"
        ).execute()
        
        rows = result.get("values", [])
        
        emails = []
        for row in rows:
            email = _parse_sheet_row_to_email(row, member)
            if email:
                emails.append(email)
        
        return emails
    except Exception as e:
        # Log error but don't crash - skip this member gracefully
        print(f"Failed to read sheet data for user {member.email}: {str(e)}")
        return []


def get_family_emails_for_user(current_user: User, db: Session) -> dict:
    """Fetch combined email data from all family members' Google Sheets.
    
    Returns:
        dict with 'emails' key containing merged, sorted email list with member attribution,
        and 'failed_members' key containing members whose data couldn't be fetched.
    """
    if not current_user.family_id:
        return {
            "emails": [],
            "failed_members": [],
        }
    
    # Get all family members who have completed setup
    family_members = (
        db.query(User)
        .filter(
            User.family_id == current_user.family_id,
            User.is_setup_completed == True,
            User.spreadsheet_id.isnot(None)
        )
        .order_by(User.name.asc(), User.email.asc())
        .all()
    )
    
    all_emails = []
    failed_members = []
    
    # Fetch email data from each family member's sheet
    for member in family_members:
        emails = _read_member_sheet_data(member)
        if emails:
            all_emails.extend(emails)
        elif member.spreadsheet_id:
            # Only mark as failed if they have a spreadsheet_id but we couldn't read it
            failed_members.append({
                "user_id": member.id,
                "email": member.email,
                "name": member.name or member.email,
            })
    
    # Sort by date (most recent first)
    all_emails.sort(key=email_timestamp, reverse=True)
    
    return {
        "emails": all_emails,
        "failed_members": failed_members,
    }
