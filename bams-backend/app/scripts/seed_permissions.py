"""
Seed the fixed (module, action) permissions catalog.

This is the global catalog roles pick from when an org builds its
permission matrix -- it isn't org-specific and isn't meant to be edited
through the app. Safe to re-run: existing (module, action) rows are left
alone except for refreshing their name/description if this list changes,
and only genuinely new rows get inserted. Run it once against dev, then
again against prod whenever this list changes.

Usage (from bams-backend/):
    .venv/Scripts/python -m app.scripts.seed_permissions
"""

from ..database import SessionLocal
from ..models.permission import Permission

# (module, action, name, description)
PERMISSIONS = [
    ("transactions", "update", "Edit Transactions", "Edit a transaction's details (category, narration, counterparty, etc.)."),
    ("sheets", "view", "View Sheets", "See whether the org's Google Sheet connection is set up."),
    ("accounts", "view", "View Accounts", "See the list of bank accounts."),
    ("accounts", "create", "Add Accounts", "Add a new bank account."),
    ("audit_log", "view", "View Audit Log", "See the history of manual edits made to transactions."),
    ("chat_assistant", "view", "View Chat Assistant", "Use the AI chat assistant."),
    ("users", "view", "View Users", "See the list of users in this organization."),
    ("users", "create", "Create Users", "Create a new sub-user."),
    ("users", "update", "Update Users", "Edit an existing user's details or role."),
    ("users", "delete", "Delete Users", "Remove a user from this organization."),
    ("roles", "view", "View Roles", "See the list of roles and what each one can do."),
    ("roles", "create", "Create Roles", "Create a new role."),
    ("roles", "update", "Update Roles", "Rename a role or change which permissions it grants."),
    ("roles", "delete", "Delete Roles", "Delete a role."),
    ("upload_statements", "trigger", "Upload Statements", "Upload bank statement PDFs for parsing."),
    ("sync_data", "trigger", "Sync Data", "Trigger an incremental sync of new emails/transactions."),
    ("export_data", "trigger", "Export Data", "Export data (transactions, accounts, audit log) to a file."),
]


def seed_permissions() -> None:
    db = SessionLocal()
    try:
        existing = {(row.module, row.action): row for row in db.query(Permission).all()}

        created = 0
        updated = 0
        for module, action, name, description in PERMISSIONS:
            row = existing.get((module, action))
            if row is None:
                db.add(Permission(module=module, action=action, name=name, description=description))
                created += 1
            elif row.name != name or row.description != description:
                row.name = name
                row.description = description
                updated += 1

        db.commit()
        unchanged = len(PERMISSIONS) - created - updated
        print(f"Permissions seeded: {created} created, {updated} updated, {unchanged} unchanged.")
    finally:
        db.close()


if __name__ == "__main__":
    seed_permissions()
