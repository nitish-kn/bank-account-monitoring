import { FileSpreadsheetIcon, GalleryVerticalEnd, Landmark, LayoutDashboardIcon, UsersRound, History, MessageCircle, TriangleAlert, ShieldCheck } from "lucide-react";
import { PERMISSIONS } from "../lib/permissions";

// `permission` gates both the sidebar entry and the route itself (see
// App.jsx). Links without one are open to every signed-in user.
export const NavLinks = [
  { name: "Dashboard", icon: <LayoutDashboardIcon className="h-4 w-4" />, route: "/dashboard", },
  { name: "All Transactions", icon: <GalleryVerticalEnd className="h-4 w-4" />, route: "/transactions", },
  { name: "All Accounts", icon: <Landmark className="h-4 w-4" />, route: "/all-accounts", permission: PERMISSIONS.ACCOUNTS_VIEW, },
  { name: "Audit Logs", icon: <History className="h-4 w-4" />, route: "/audit-log", permission: PERMISSIONS.AUDIT_LOG_VIEW, },
  { name: "Chat Assistant", icon: <MessageCircle className="h-4 w-4" />, route: "/chat-assistant", permission: PERMISSIONS.CHAT_ASSISTANT_VIEW, },
  { name: "Users", icon: <UsersRound className="h-4 w-4" />, route: "/users", permission: PERMISSIONS.USERS_VIEW, },
  { name: "Roles & Permissions", icon: <ShieldCheck className="h-4 w-4" />, route: "/roles-permissions", permission: PERMISSIONS.ROLES_VIEW, },
  // { name: "Needs Review", icon: <TriangleAlert className="h-4 w-4" />, route: "/needs-review", },
  // { name: "Consolidated View", icon: <UsersRound className="h-4 w-4" />, route: "/consolidated-view", },
];
