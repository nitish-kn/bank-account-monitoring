import { FileSpreadsheetIcon, GalleryVerticalEnd, Landmark, LayoutDashboardIcon, UsersRound } from "lucide-react";

export const NavLinks = [
  { name: "Dashboard", icon: <LayoutDashboardIcon className="h-4 w-4" />, route: "/dashboard", },
  { name: "All Transactions", icon: <GalleryVerticalEnd className="h-4 w-4" />, route: "/transactions", },
  { name: "All Accounts", icon: <Landmark className="h-4 w-4" />, route: "/all-accounts", },
  // { name: "Consolidated View", icon: <UsersRound className="h-4 w-4" />, route: "/consolidated-view", },
];
