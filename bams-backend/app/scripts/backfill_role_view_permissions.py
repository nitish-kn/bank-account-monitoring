"""
Backfill: grant a role's module.view permission wherever it already holds a
create/update/delete for that module without it.

set_role_permissions() now refuses to save a role with create/update/delete
for a module but no view for it -- correct going forward, but any role
configured before that guard existed can already be in that state, and
saving it (even an unrelated change) then fails with "Grant view access
before other actions for: ...". This brings existing roles into compliance
by granting the missing view rather than stripping what was already
explicitly granted -- nobody checks "create users" meaning "but don't let
them see the user list".

Safe to re-run: only adds rows that are missing, never removes anything.

Usage (from bams-backend/):
    .venv/Scripts/python -m app.scripts.backfill_role_view_permissions
"""

from ..database import SessionLocal
from ..models.permission import Permission
from ..models.role_permission import RolePermission
from ..models.roles import Role


def backfill_role_view_permissions() -> None:
    db = SessionLocal()
    try:
        permissions = db.query(Permission).all()
        view_id_by_module = {p.module: p.id for p in permissions if p.action == "view"}
        module_by_id = {p.id: p.module for p in permissions}

        granted = 0
        roles_fixed = 0

        for role in db.query(Role).filter(Role.is_system.is_(False)).all():
            role_permission_ids = {
                rp.permission_id
                for rp in db.query(RolePermission).filter(RolePermission.role_id == role.id)
            }
            modules_used = {module_by_id[pid] for pid in role_permission_ids if pid in module_by_id}

            missing_view_ids = {
                view_id_by_module[module]
                for module in modules_used
                if module in view_id_by_module and view_id_by_module[module] not in role_permission_ids
            }
            if not missing_view_ids:
                continue

            for permission_id in missing_view_ids:
                db.add(RolePermission(role_id=role.id, permission_id=permission_id))
            granted += len(missing_view_ids)
            roles_fixed += 1
            print(f"  role id={role.id} org={role.org_id} ({role.name!r}): granted {len(missing_view_ids)} view permission(s).")

        db.commit()
        print(f"Done. {roles_fixed} role(s) fixed, {granted} view permission(s) granted.")
    finally:
        db.close()


if __name__ == "__main__":
    backfill_role_view_permissions()
