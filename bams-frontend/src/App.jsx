import "./App.css";
import { Route, Routes, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import { ProtectedRoute, PublicRoute } from "./components/RouteGuards";
import { useAuthStore } from "./store/authStore";
import Layout from "./components/Layout";
import ConsolidatedView from "./pages/ConsolidatedView";
import { Transactions } from "./pages/Transactions";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import AuditLog from "./pages/AuditLog";
import ChatAssistant from "./pages/ChatAssistant";
import { Bounce, ToastContainer, toast } from "react-toastify";
import { useEffect } from "react";
import { getTallyCredentials, tallyApi } from "./api/tally";
import NeedsReview from "./pages/NeedsReview";
import Users from "./pages/Users";
import RolePermissions from "./pages/RolePermissions";
import { PERMISSIONS, usePermissions } from "./lib/permissions";
import TallyView from "./pages/TallyView";

function App() {
  const { isAuthenticated, accessToken } = useAuthStore();
  const isAuthenticatedWithToken = isAuthenticated && Boolean(accessToken);
  const can = usePermissions();
  const canUseTally = can(PERMISSIONS.EXPORT_DATA);

  useEffect(() => {
    if (!isAuthenticatedWithToken || !canUseTally) return;
    let cancelled = false;
    let checkVersion = 0;
    const checkConnection = () => {
      const version = ++checkVersion;
      const isCurrent = () => !cancelled && version === checkVersion;
      tallyApi.getHealth().then(() => {
        if (!isCurrent()) return;
        toast.dismiss("tally-not-connected");
        if (getTallyCredentials()) {
          toast.success("Tally connected.", { toastId: "tally-connected" });
        } else {
          toast.info("Tally connected. Configure your Tally user (username and password) on the Tally page.", {
            toastId: "tally-configure-user",
          });
        }
      }).catch((err) => {
        if (!isCurrent()) return;
        if (err.response?.status === 503) {
          toast.warning("Tally not connected.", { toastId: "tally-not-connected" });
        } else if (err.response?.status === 502) {
          toast.error(err.response.data?.detail || "Could not connect to Tally.", { toastId: "tally-error" });
        }
      });
    };
    checkConnection();
    window.addEventListener("tally-credentials-changed", checkConnection);
    return () => {
      cancelled = true;
      window.removeEventListener("tally-credentials-changed", checkConnection);
    };
  }, [isAuthenticatedWithToken, canUseTally]);

  return (
    <>
    <Routes>
      <Route path="/" element={<PublicRoute><Login /></PublicRoute>} />
      
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/consolidated-view" element={<ConsolidatedView />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/all-accounts" element={<ProtectedRoute permission={PERMISSIONS.ACCOUNTS_VIEW}><Accounts /></ProtectedRoute>} />
        <Route path="/audit-log" element={<ProtectedRoute permission={PERMISSIONS.AUDIT_LOG_VIEW}><AuditLog /></ProtectedRoute>} />
        <Route path="/chat-assistant" element={<ProtectedRoute permission={PERMISSIONS.CHAT_ASSISTANT_VIEW}><ChatAssistant /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute permission={PERMISSIONS.USERS_VIEW}><Users /></ProtectedRoute>} />
        <Route path="/roles-permissions" element={<ProtectedRoute permission={PERMISSIONS.ROLES_VIEW}><RolePermissions /></ProtectedRoute>} />
        <Route path="/needs-review" element={<ProtectedRoute permission={PERMISSIONS.NEEDS_REVIEW_VIEW}><NeedsReview /></ProtectedRoute>} />
        <Route path="/tally-view" element={<ProtectedRoute permission={PERMISSIONS.EXPORT_DATA}><TallyView /></ProtectedRoute>} />
      </Route>
      
      <Route
        path="*"
        element={
          <Navigate to={isAuthenticatedWithToken ? "/dashboard" : "/"} replace />
        }
      />
    </Routes>

    <ToastContainer
      position="bottom-right"
      autoClose={5000}
      hideProgressBar={false}
      newestOnTop={false}
      closeOnClick={false}
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="light"
      transition={Bounce}
      bodyClassName="text-xs font-medium"
    />
    </>

  );
}

export default App;
