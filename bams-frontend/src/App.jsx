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
import { Bounce, ToastContainer } from "react-toastify";
import NeedsReview from "./pages/NeedsReview";
import Users from "./pages/Users";
import RolePermissions from "./pages/RolePermissions";
import { PERMISSIONS } from "./lib/permissions";

function App() {
  const { isAuthenticated, accessToken } = useAuthStore();
  const isAuthenticatedWithToken = isAuthenticated && Boolean(accessToken);

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
        {/* <Route path="/needs-review" element={<NeedsReview />} /> */}
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
