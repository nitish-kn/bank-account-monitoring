import "./App.css";
import { Route, Routes, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import { ProtectedRoute, PublicRoute } from "./components/RouteGuards";
import { useAuthStore } from "./store/authStore";
import Layout from "./components/Layout";
import ConsolidatedView from "./pages/ConsolidatedView";
import { Transactions } from "./pages/Transactions";
import Dashboard from "./pages/Dashboard";

function App() {
  const { isAuthenticated, accessToken } = useAuthStore();
  const isAuthenticatedWithToken = isAuthenticated && Boolean(accessToken);

  return (
    <Routes>
      <Route path="/" element={<PublicRoute><Login /></PublicRoute>} />
      
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/consolidated-view" element={<ConsolidatedView />} />
        <Route path="/transactions" element={<Transactions />} />
      </Route>
      
      <Route
        path="*"
        element={
          <Navigate to={isAuthenticatedWithToken ? "/dashboard" : "/"} replace />
        }
      />
    </Routes>
  );
}

export default App;
