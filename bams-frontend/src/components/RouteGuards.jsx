import { useAuthStore } from "../store/authStore";
import { Navigate } from "react-router-dom";

export function ProtectedRoute({ children }) {
  const { isAuthenticated, accessToken } = useAuthStore();
  const isAuthenticatedWithToken = isAuthenticated && Boolean(accessToken);

  if (!isAuthenticatedWithToken) {
    return <Navigate to="/" replace />;
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
