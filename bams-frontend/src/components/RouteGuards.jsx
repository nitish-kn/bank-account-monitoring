import { useAuthStore } from "../store/authStore";
import { Navigate } from "react-router-dom";
import { usePermissions } from "../lib/permissions";


// A route guard that checks if the user is authenticated and has the required permission to access a route.
export function ProtectedRoute({ children, permission }) {
  const { isAuthenticated, accessToken } = useAuthStore();

  // Main authentication check: if the user is not authenticated, redirect to the login page.
  const can = usePermissions();
  const isAuthenticatedWithToken = isAuthenticated && Boolean(accessToken);

  if (!isAuthenticatedWithToken) {
    return <Navigate to="/" replace />;
  }

  // Someone who reached a gated URL directly (typed, bookmarked, stale link) lands on the dashboard rather than an empty page they can't use.
  if (!can(permission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}


// Routes that can be accessed by any user, even if they are not authenticated. If the user is authenticated, they will be redirected to the dashboard.
export function PublicRoute({ children }) {
  const { isAuthenticated, accessToken } = useAuthStore();
  const isAuthenticatedWithToken = isAuthenticated && Boolean(accessToken);

  if (isAuthenticatedWithToken) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
