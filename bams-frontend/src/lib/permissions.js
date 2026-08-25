import { useAuthStore } from "../store/authStore";

/**
 * Permission keys are "module.action" and match the backend catalog exactly.
 * Kept as constants so a typo is a build-time missing import rather than a
 * silently-always-false string comparison.
 */
export const PERMISSIONS = {
  ACCOUNTS_VIEW: "accounts.view",
  ACCOUNTS_CREATE: "accounts.create",
  TRANSACTIONS_UPDATE: "transactions.update",
  AUDIT_LOG_VIEW: "audit_log.view",
  CHAT_ASSISTANT_VIEW: "chat_assistant.view",
  SHEETS_VIEW: "sheets.view",
  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_DELETE: "users.delete",
  ROLES_VIEW: "roles.view",
  ROLES_CREATE: "roles.create",
  ROLES_UPDATE: "roles.update",
  ROLES_DELETE: "roles.delete",
  UPLOAD_STATEMENTS: "upload_statements.trigger",
  SYNC_DATA: "sync_data.trigger",
  EXPORT_DATA: "export_data.trigger",
};

/** Hook form: `const can = usePermissions(); can(PERMISSIONS.USERS_VIEW)` */
export const usePermissions = () => {
  const permissions = useAuthStore((state) => state.permissions);
  return (permission) => !permission || (permissions || []).includes(permission);
};

/** Single-permission convenience: `useHasPermission(PERMISSIONS.USERS_VIEW)` */
export const useHasPermission = (permission) => usePermissions()(permission);
