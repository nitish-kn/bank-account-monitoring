import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Lock, EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import CustomButton from "../components/ui/CustomButton";
import CustomInput from "../components/ui/CustomInput";
import CustomPopover from "../components/ui/CustomPopover";
import DialogPopup from "../components/ui/DialogPopup";
import { RoleBadge } from "../utils/Badges";
import { rbacApi } from "../api/rbac";
import { usePermissions, PERMISSIONS } from "../lib/permissions";

const errorText = (err, fallback) => err?.response?.data?.detail || err?.message || fallback;

/** roleId -> Set(permissionId). Super Admin implicitly holds everything. */
const buildMatrix = (roles, permissions) =>
  Object.fromEntries(
    roles.map((role) => [
      role.id,
      new Set(role.is_system ? permissions.map((p) => p.id) : role.permission_ids),
    ]),
  );

const matrixKey = (matrix) =>
  JSON.stringify(
    Object.entries(matrix).map(([roleId, ids]) => [roleId, [...ids].sort()]),
  );

const RolePermissions = () => {
  const can = usePermissions();
  const canCreate = can(PERMISSIONS.ROLES_CREATE);
  const canUpdate = can(PERMISSIONS.ROLES_UPDATE);
  const canDelete = can(PERMISSIONS.ROLES_DELETE);

  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [matrix, setMatrix] = useState({});
  const [savedKey, setSavedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [roleDialog, setRoleDialog] = useState(null); // null | {mode, role}
  const [roleForm, setRoleForm] = useState({ name: "", description: "" });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const isDirty = matrixKey(matrix) !== savedKey;

  // A module's create/update/delete only make sense once its own view
  // permission is granted, so those checkboxes stay locked until then.
  const viewPermissionIdByModule = useMemo(
    () =>
      Object.fromEntries(
        permissions.filter((p) => p.action === "view").map((p) => [p.module, p.id]),
      ),
    [permissions],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await rbacApi.listRoles();
      const nextRoles = data.roles || [];
      const nextPermissions = data.permissions || [];
      const nextMatrix = buildMatrix(nextRoles, nextPermissions);
      setRoles(nextRoles);
      setPermissions(nextPermissions);
      setMatrix(nextMatrix);
      setSavedKey(matrixKey(nextMatrix));
    } catch (err) {
      toast.error(errorText(err, "Failed to load roles."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleCell = (roleId, permission, isSystem) => {
    if (isSystem || !canUpdate) return;
    const viewId = viewPermissionIdByModule[permission.module];
    const lockedByView = permission.action !== "view" && viewId && !matrix[roleId]?.has(viewId);
    if (lockedByView) return;

    setMatrix((prev) => {
      const next = new Set(prev[roleId]);
      const turningOff = next.has(permission.id);
      turningOff ? next.delete(permission.id) : next.add(permission.id);

      // Revoking view leaves the module's other permissions dangling --
      // drop them too rather than allow that invalid combination.
      if (permission.action === "view" && turningOff) {
        permissions.forEach((p) => {
          if (p.module === permission.module) next.delete(p.id);
        });
      }
      return { ...prev, [roleId]: next };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Only push roles whose set actually changed.
      const original = buildMatrix(roles, permissions);
      const changed = roles.filter(
        (role) =>
          !role.is_system &&
          [...matrix[role.id]].sort().join() !== [...original[role.id]].sort().join(),
      );
      await Promise.all(
        changed.map((role) => rbacApi.setRolePermissions(role.id, [...matrix[role.id]])),
      );
      toast.success("Permissions updated.");
      load();
    } catch (err) {
      toast.error(errorText(err, "Failed to save permissions."));
    } finally {
      setSaving(false);
    }
  };

  const openRoleDialog = (mode, role = null) => {
    setRoleForm({ name: role?.name || "", description: role?.description || "" });
    setRoleDialog({ mode, role });
  };

  const handleRoleSubmit = async () => {
    try {
      if (roleDialog.mode === "edit") {
        await rbacApi.updateRole(roleDialog.role.id, roleForm);
        toast.success("Role updated.");
      } else {
        await rbacApi.createRole(roleForm);
        toast.success("Role created.");
      }
      setRoleDialog(null);
      load();
    } catch (err) {
      toast.error(errorText(err, "Failed to save role."));
    }
  };

  const handleConfirmDelete = async () => {
    try {
      await rbacApi.deleteRole(deleteTarget.id);
      toast.success("Role deleted.");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(errorText(err, "Failed to delete role."));
    }
  };

  const columns = useMemo(() => permissions, [permissions]);

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Roles</h1>

          <div className="flex items-center gap-2">
            {canCreate && (
              <CustomButton variant="outline" color="blue" onClick={() => openRoleDialog("create")} className="gap-1.5">
                <Plus className="h-4 w-4" /> Add Role
              </CustomButton>
            )}
            {canUpdate && (
              <CustomButton onClick={handleSave} disabled={!isDirty || saving}>
                {saving ? "Saving..." : "Save Changes"}
              </CustomButton>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500 font-medium">
          What each role can see and do, across every part of the app -- grant view access
          before other actions, they stay locked until then
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <p className="px-6 py-10 text-center text-sm font-medium text-gray-400 animate-pulse">
            Loading roles...
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-50">
                  <th className="sticky left-0 z-10 bg-blue-50 px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wide text-gray-600 w-72">
                    Role
                  </th>
                  {columns.map((permission) => (
                    <th
                      key={permission.id}
                      title={permission.description || permission.key}
                      className="px-6 py-3.5 text-center text-[11px] font-bold uppercase tracking-wide text-gray-600 whitespace-nowrap"
                    >
                      {permission.name || permission.key}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {roles.map((role) => (
                  <tr key={role.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <RoleBadge role={role.name} />
                        {role.is_system && <Lock className="h-3 w-3 text-gray-300 shrink-0" />}

                        {!role.is_system && (canUpdate || canDelete) && (
                          <CustomPopover
                            trigger={
                              <button
                                type="button"
                                className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                                aria-label={`Options for ${role.name}`}
                              >
                                <EllipsisVertical className="h-4 w-4" />
                              </button>
                            }
                          >
                            <div className="flex flex-col gap-0.5 py-1">
                              {canUpdate && (
                                <CustomButton
                                  color="gray"
                                  variant="ghost"
                                  size="1"
                                  className="h-8! justify-start! gap-2.5! px-2.5!"
                                  onClick={() => openRoleDialog("edit", role)}
                                >
                                  <Pencil className="h-3.5 w-3.5" /> Rename
                                </CustomButton>
                              )}
                              {canDelete && (
                                <CustomButton
                                  color="red"
                                  variant="ghost"
                                  size="1"
                                  className="h-8! justify-start! gap-2.5! px-2.5!"
                                  onClick={() => setDeleteTarget(role)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Delete
                                </CustomButton>
                              )}
                            </div>
                          </CustomPopover>
                        )}
                      </div>
                    </td>

                    {columns.map((permission) => {
                      const viewId = viewPermissionIdByModule[permission.module];
                      const lockedByView = permission.action !== "view" && viewId && !matrix[role.id]?.has(viewId);
                      const locked = role.is_system || !canUpdate || lockedByView;
                      return (
                        <td key={permission.id} className="px-6 py-3.5">
                          <label className="flex items-center justify-center py-1">
                            <input
                              type="checkbox"
                              checked={matrix[role.id]?.has(permission.id) || false}
                              disabled={locked}
                              onChange={() => toggleCell(role.id, permission, role.is_system)}
                              aria-label={`${role.name} -- ${permission.name || permission.key}`}
                              title={lockedByView ? "Grant view access for this first" : (permission.description || permission.key)}
                              className={`h-4.5 w-4.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                                locked ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                              }`}
                            />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DialogPopup
        open={Boolean(roleDialog)}
        setOpen={(open) => !open && setRoleDialog(null)}
        heading={roleDialog?.mode === "edit" ? "Rename Role" : "Add Role"}
        subheading={
          roleDialog?.mode === "edit"
            ? "Update this role's name or description."
            : "Give it a name -- you can pick its permissions from the matrix afterward."
        }
        showButtons
        successbtntxt={roleDialog?.mode === "edit" ? "Save" : "Create Role"}
        confirmDisabled={!roleForm.name.trim()}
        onConfirm={handleRoleSubmit}
      >
        <div className="flex flex-col gap-3">
          <CustomInput
            labelText="Role name"
            id="role-name"
            value={roleForm.name}
            onChange={(val) => setRoleForm((prev) => ({ ...prev, name: val }))}
            placeholder="e.g. Auditor"
          />
          <CustomInput
            labelText="Description (optional)"
            id="role-description"
            value={roleForm.description}
            onChange={(val) => setRoleForm((prev) => ({ ...prev, description: val }))}
            placeholder="What is this role for?"
          />
        </div>
      </DialogPopup>

      <DialogPopup
        open={Boolean(deleteTarget)}
        setOpen={(open) => !open && setDeleteTarget(null)}
        heading="Delete role?"
        subheading={deleteTarget ? `The "${deleteTarget.name}" role will be removed.` : ""}
        showButtons
        successbtntxt="Delete"
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default RolePermissions;
