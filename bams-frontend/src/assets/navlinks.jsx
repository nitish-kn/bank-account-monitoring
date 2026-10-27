import { FileSpreadsheetIcon, GalleryVerticalEnd, Landmark, LayoutDashboardIcon, UsersRound, History, MessageCircle, TriangleAlert, ShieldCheck, Flag, SquareDashedText, FileSliders, ChartColumn, Notebook, BookOpen, FileSpreadsheet, Scale, ChartNoAxesCombined, ArrowLeftRight, ListChecks, Waves, Gauge, NotebookText, } from "lucide-react";
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
  { name: "Needs Review", icon: <TriangleAlert className="h-4 w-4" />, route: "/needs-review", permission: PERMISSIONS.NEEDS_REVIEW_VIEW, },
  { name: "Tally", icon: <BookOpen className="h-4 w-4" />, permission: PERMISSIONS.EXPORT_DATA,
    sublinks: [
      { name: "Tally View", icon: <FileSpreadsheet className="h-4 w-4" />, route: "/tally-view", permission: PERMISSIONS.EXPORT_DATA, },
      { name: "Trial Balance", icon: <ListChecks className="h-4 w-4" />, route: "/trial-balance", permission: PERMISSIONS.EXPORT_DATA, },
      { name: "Balance Sheet", icon: <Scale className="h-4 w-4" />, route: "/balance-sheet", permission: PERMISSIONS.EXPORT_DATA, },
      { name: "Profit & Loss", icon: <ChartNoAxesCombined className="h-4 w-4" />, route: "/profit-loss", permission: PERMISSIONS.EXPORT_DATA, },
      { name: "Cash Flow", icon: <ArrowLeftRight className="h-4 w-4" />, route: "/cash-flow", permission: PERMISSIONS.EXPORT_DATA, },
      { name: "Funds Flow", icon: <Waves className="h-4 w-4" />, route: "/funds-flow", permission: PERMISSIONS.EXPORT_DATA, },
      { name: "Ratio Analysis", icon: <Gauge className="h-4 w-4" />, route: "/ratio-analysis", permission: PERMISSIONS.EXPORT_DATA, },
      { name: "Statement of Accounts", icon: <NotebookText className="h-4 w-4" />, route: "/statement-of-accounts", permission: PERMISSIONS.EXPORT_DATA, },
    ]
  },
  { name: "Stocks & Funds", icon: <ChartColumn className="h-4 w-4" />, route: "/stocks-funds", permission: PERMISSIONS.EXPORT_DATA, },
  // { name: "Consolidated View", icon: <UsersRound className="h-4 w-4" />, route: "/consolidated-view", },
];
