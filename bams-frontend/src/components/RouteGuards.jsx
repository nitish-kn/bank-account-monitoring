import { useAuthStore } from "../store/authStore";
import { Navigate } from "react-router-dom";
import { usePermissions } from "../lib/permissions";

export function ProtectedRoute({ children, permission }) {
  const { isAuthenticated, accessToken } = useAuthStore();
  const can = usePermissions();
  const isAuthenticatedWithToken = isAuthenticated && Boolean(accessToken);

  if (!isAuthenticatedWithToken) {
    return <Navigate to="/" replace />;
  }

  // Someone who reached a gated URL directly (typed, bookmarked, stale link)
  // lands on the dashboard rather than an empty page they can't use.
  if (!can(permission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export function PublicRoute({ children }) {
  const { isAuthenticated, accessToken } = useAuthStore();
  const isAuthenticatedWithToken = isAuthenticated && Boolean(accessToken);

  if (isAuthenticatedWithToken) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
