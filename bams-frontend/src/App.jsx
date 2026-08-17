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
        <Route path="/all-accounts" element={<Accounts />} />
        <Route path="/audit-log" element={<AuditLog />} />
        <Route path="/chat-assistant" element={<ChatAssistant />} />
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
