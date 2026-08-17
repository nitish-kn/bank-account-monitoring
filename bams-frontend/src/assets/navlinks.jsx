import { FileSpreadsheetIcon, GalleryVerticalEnd, Landmark, LayoutDashboardIcon, UsersRound, History, MessageCircle, TriangleAlert } from "lucide-react";

export const NavLinks = [
  { name: "Dashboard", icon: <LayoutDashboardIcon className="h-4 w-4" />, route: "/dashboard", },
  { name: "All Transactions", icon: <GalleryVerticalEnd className="h-4 w-4" />, route: "/transactions", },
  { name: "All Accounts", icon: <Landmark className="h-4 w-4" />, route: "/all-accounts", },
  { name: "Audit Logs", icon: <History className="h-4 w-4" />, route: "/audit-log", },
  { name: "Chat Assistant", icon: <MessageCircle className="h-4 w-4" />, route: "/chat-assistant", },
  // { name: "Needs Review", icon: <TriangleAlert className="h-4 w-4" />, route: "/needs-review", },
  // { name: "Consolidated View", icon: <UsersRound className="h-4 w-4" />, route: "/consolidated-view", },
];
