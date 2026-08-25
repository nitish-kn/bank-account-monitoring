import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, BadgeCheck, CheckCircle2, EllipsisVertical, Pencil, Trash2, Plus, Search, Eye, EyeOff } from "lucide-react";
import { toast } from "react-toastify";
import CustomTable from "../components/ui/CustomTable";
import CustomInput from "../components/ui/CustomInput";
import CustomButton from "../components/ui/CustomButton";
import CustomSelect from "../components/ui/CustomSelect";
import CustomPopover from "../components/ui/CustomPopover";
import DialogPopup from "../components/ui/DialogPopup";
import UnderlineTabs from "../components/ui/UnderlineTabs";
import { RoleBadge } from "../utils/Badges";
import { rbacApi } from "../api/rbac";
import { usePermissions, PERMISSIONS } from "../lib/permissions";
import { formatDate } from "../lib/helper";

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-rose-100 text-rose-700",
];

const initialsOf = (name) =>
  String(name || "")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const EMPTY_FORM = { name: "", email: "", role_id: "", password: "" };

const errorText = (err, fallback) => err?.response?.data?.detail || err?.message || fallback;

const Users = () => {
  const can = usePermissions();
  const canCreate = can(PERMISSIONS.USERS_CREATE);
  const canUpdate = can(PERMISSIONS.USERS_UPDATE);
  const canDelete = can(PERMISSIONS.USERS_DELETE);

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [initialFormData, setInitialFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  // userId -> revealed password string, or "loading"
  const [revealedPasswords, setRevealedPasswords] = useState({});

  const isFormDirty = useMemo(
    () => JSON.stringify(formData) !== JSON.stringify(initialFormData),
    [formData, initialFormData],
  );

  // Roles come back with the users so the assignment dropdown and filter tabs
  // work for someone who can manage users but doesn't hold roles.view.
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await rbacApi.listUsers();
      setUsers(data.users || []);
      setRoles(data.roles || []);
    } catch (err) {
      toast.error(errorText(err, "Failed to load users."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const tabs = useMemo(() => {
    const roleTabs = roles.map((role) => ({
      value: String(role.id),
      label: role.name,
      count: users.filter((user) => user.role_id === role.id).length,
    }));
    return [{ value: "all", label: "All", count: users.length }, ...roleTabs];
  }, [roles, users]);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users.filter((user) => {
      const matchesTab = activeTab === "all" || String(user.role_id) === activeTab;
      const matchesSearch =
        !term ||
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term);
      return matchesTab && matchesSearch;
    });
  }, [users, activeTab, searchTerm]);

  const openCreateForm = () => {
    const blank = { ...EMPTY_FORM, role_id: roles.find((r) => !r.is_system)?.id ?? "" };
    setEditingUser(null);
    setFormData(blank);
    setInitialFormData(blank);
    setShowPassword(false);
    setFormOpen(true);
  };

  const openEditForm = (user) => {
    const snapshot = { name: user.name, email: user.email, role_id: user.role_id, password: "" };
    setEditingUser(user);
    setFormData(snapshot);
    setInitialFormData(snapshot);
    setShowPassword(false);
    setFormOpen(true);
  };

  const handleFormSubmit = async () => {
    setSaving(true);
    try {
      if (editingUser) {
        // Only send what actually changed -- an untouched password field
        // must not overwrite the stored one.
        const payload = {};
        if (formData.name !== initialFormData.name) payload.name = formData.name;
        if (formData.role_id !== initialFormData.role_id) payload.role_id = Number(formData.role_id);
        if (formData.password) payload.password = formData.password;
        await rbacApi.updateUser(editingUser.id, payload);
        toast.success("User updated.");
      } else {
        await rbacApi.createUser({ ...formData, role_id: Number(formData.role_id) });
        toast.success("User created.");
      }
      setFormOpen(false);
      loadUsers();
    } catch (err) {
      toast.error(errorText(err, "Failed to save user."));
    } finally {
      setSaving(false);
    }
  };

  const togglePasswordReveal = async (row) => {
    // Already showing (or fetching) -- click again to hide.
    if (row.id in revealedPasswords) {
      setRevealedPasswords((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      return;
    }

    setRevealedPasswords((prev) => ({ ...prev, [row.id]: "loading" }));
    try {
      const data = await rbacApi.revealPassword(row.id);
      setRevealedPasswords((prev) => ({ ...prev, [row.id]: data.password }));
    } catch (err) {
      toast.error(errorText(err, "Failed to reveal password."));
      setRevealedPasswords((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    }
  };

  const handleConfirmDelete = async () => {
    try {
      await rbacApi.deleteUser(deleteTarget.id);
      toast.success("User removed.");
      setDeleteTarget(null);
      loadUsers();
    } catch (err) {
      toast.error(errorText(err, "Failed to remove user."));
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "ACCOUNT",
        columnWidth: "220px",
        render: (row) => (
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${AVATAR_COLORS[row.id % AVATAR_COLORS.length]}`}
            >
              {initialsOf(row.name)}
            </span>
            <span className="font-semibold text-gray-900 text-sm">{row.name}</span>
          </div>
        ),
      },
      {
        key: "email",
        header: "EMAIL ADDRESS",
        columnWidth: "260px",
        render: (row) => (
          <a
            href={`mailto:${row.email}`}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline truncate"
            title={row.email}
          >
            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <span className="truncate">{row.email}</span>
          </a>
        ),
      },
      {
        key: "role_name",
        header: "ROLE",
        columnWidth: "150px",
        render: (row) => <RoleBadge role={row.role_name} />,
      },
      {
        key: "sign_in",
        header: "SIGN IN",
        columnWidth: "120px",
        render: (row) => (
          <span className="text-xs font-medium text-gray-600">
            {row.is_owner ? "Google" : "Password"}
          </span>
        ),
      },
      {
        key: "password",
        header: "PASSWORD",
        columnWidth: "160px",
        render: (row) => {
          if (row.is_owner) return <span className="text-xs text-gray-300">—</span>;
          const revealed = revealedPasswords[row.id];
          return (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600 font-mono">
                {revealed === "loading" ? "..." : revealed !== undefined ? revealed : "••••••••"}
              </span>
              {canUpdate && (
                <button
                  type="button"
                  onClick={() => togglePasswordReveal(row)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label={revealed !== undefined ? "Hide password" : "Show password"}
                >
                  {revealed !== undefined ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          );
        },
      },
      {
        key: "is_active",
        header: "STATUS",
        columnWidth: "110px",
        render: (row) => (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <CheckCircle2
              className={`h-3.5 w-3.5 shrink-0 ${row.is_active ? "text-emerald-500" : "text-gray-300"}`}
            />
            {row.is_active ? "Active" : "Inactive"}
          </div>
        ),
      },
      {
        key: "last_login_at",
        header: "LAST LOGIN",
        columnWidth: "140px",
        render: (row) => (
          <span className="text-xs text-gray-500">
            {row.last_login_at ? formatDate(row.last_login_at) : "Never"}
          </span>
        ),
      },
      {
        key: "action",
        header: "ACTION",
        columnWidth: "80px",
        render: (row) => {
          // The org owner can't be edited or removed, so an empty menu would
          // just be a dead control.
          if (row.is_owner || (!canUpdate && !canDelete)) {
            return <span className="text-xs text-gray-300">—</span>;
          }
          return (
            <CustomPopover
              trigger={
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                  aria-label={`Options for ${row.name}`}
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
                    onClick={() => openEditForm(row)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </CustomButton>
                )}
                {canDelete && (
                  <CustomButton
                    color="red"
                    variant="ghost"
                    size="1"
                    className="h-8! justify-start! gap-2.5! px-2.5!"
                    onClick={() => setDeleteTarget(row)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </CustomButton>
                )}
              </div>
            </CustomPopover>
          );
        },
      },
    ],
    [canUpdate, canDelete, openEditForm, revealedPasswords],
  );

  const assignableRoles = roles.filter((role) => !role.is_system);

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Users</h1>
            <p className="text-xs text-gray-500 font-medium">
              People with access to this organization, and what role they hold
            </p>
          </div>

          {canCreate && (
            <CustomButton onClick={openCreateForm} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add New User
            </CustomButton>
          )}
        </div>

        <div className="mt-4">
          <UnderlineTabs tabs={tabs} value={activeTab} onChange={setActiveTab} />
        </div>

        <div className="mt-4 max-w-sm">
          <CustomInput
            id="user-search"
            type="search"
            name="user-search"
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by name or email..."
            icon={Search}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <CustomTable
          columns={columns}
          data={filteredUsers}
          isLoading={loading}
          getRowKey={(row) => row.id}
          emptyMessage="No users match this filter."
        />
      </div>

      <DialogPopup
        open={formOpen}
        setOpen={setFormOpen}
        heading={editingUser ? "Edit User" : "Add New User"}
        subheading={
          editingUser
            ? "Update this user's details or role."
            : "Create a sub-user and assign them a role."
        }
        showButtons
        successbtntxt={editingUser ? "Save Changes" : "Create User"}
        confirmDisabled={!isFormDirty || saving}
        isConfirming={saving}
        onConfirm={handleFormSubmit}
      >
        <div className="flex flex-col gap-3">
          {/* An admin is filling in somebody else's details here, so the
              browser's saved-credential autofill is always wrong -- it was
              overwriting the password field and leaking a name into the
              search box behind the dialog. */}
          <CustomInput
            labelText="Full name"
            id="user-name"
            value={formData.name}
            onChange={(val) => setFormData((prev) => ({ ...prev, name: val }))}
            placeholder="e.g. Jane Doe"
            autoComplete="off"
          />
          <CustomInput
            labelText="Email"
            id="user-email"
            type="email"
            icon={Mail}
            value={formData.email}
            onChange={(val) => setFormData((prev) => ({ ...prev, email: val }))}
            placeholder="jane@company.com"
            disabled={Boolean(editingUser)}
            autoComplete="off"
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
            <CustomSelect
              options={assignableRoles.map((role) => ({ label: role.name, value: role.id }))}
              value={formData.role_id}
              placeholder="Select a role"
              onValueChange={(val) => setFormData((prev) => ({ ...prev, role_id: val }))}
              triggerClassName="w-full! justify-between h-9! text-sm! rounded-md!"
            />
          </div>

          <CustomInput
            labelText={editingUser ? "New password (leave blank to keep current)" : "Password"}
            id="user-password"
            type={showPassword ? "text" : "password"}
            value={formData.password}
            onChange={(val) => setFormData((prev) => ({ ...prev, password: val }))}
            placeholder={editingUser ? "Unchanged" : "Set an initial password"}
            autoComplete="new-password"
            endAdornment={
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
        </div>
      </DialogPopup>

      <DialogPopup
        open={Boolean(deleteTarget)}
        setOpen={(open) => !open && setDeleteTarget(null)}
        heading="Remove user?"
        subheading={
          deleteTarget ? `${deleteTarget.name} will lose access to this organization.` : ""
        }
        showButtons
        successbtntxt="Remove"
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default Users;
