import { FileSpreadsheetIcon, LayoutDashboardIcon, UsersRound } from "lucide-react";

export const NavLinks = [
  { name: "Dashboard", icon: <LayoutDashboardIcon className="h-4 w-4" />, route: "/new", },
  { name: "Transactions", icon: <LayoutDashboardIcon className="h-4 w-4" />, route: "/dashboard", },
  // { name: "Consolidated View", icon: <UsersRound className="h-4 w-4" />, route: "/consolidated-view", },
];

export const avatarBgClasses = {
  blue: "bg-blue-100",
  red: "bg-red-100",
  green: "bg-green-100",
  purple: "bg-purple-100",
  yellow: "bg-yellow-100",
  gray: "bg-gray-100",
};

export const PageSizeOptions = [10, 20, 50, 100];

export const colorClasses = {
  green: {
    bg: "bg-green-50",
    icon: "text-green-600",
    value: "text-green-500",
  },
  red: {
    bg: "bg-red-50",
    icon: "text-red-600",
    value: "text-red-500",
  },
  blue: {
    bg: "bg-blue-50",
    icon: "text-blue-600",
    value: "text-blue-500",
  },
  orange: {
    bg: "bg-orange-50",
    icon: "text-orange-600",
    value: "text-orange-500",
  },
  gray: {
    bg: "bg-gray-50",
    icon: "text-gray-600",
    value: "text-gray-600",
  },
  purple: {
    bg: "bg-purple-50",
    icon: "text-purple-600",
    value: "text-purple-500",
  },
  amber: {
    bg: "bg-amber-50",
    icon: "text-amber-600",
    value: "text-amber-500",
  },
};

export const flaggedColors = {
  green: "bg-green-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  orange: "bg-orange-500",
  gray: "bg-gray-600",
  purple: "bg-purple-500",
  amber: "bg-amber-500",
};