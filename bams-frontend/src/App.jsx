import "./App.css";
import { Route, Routes, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { ProtectedRoute, PublicRoute } from "./components/RouteGuards";
import { useAuthStore } from "./store/authStore";
import Layout from "./components/Layout";
import FamilyView from "./pages/FamilyView";

function App() {
  const { isAuthenticated, accessToken } = useAuthStore();
  const isAuthenticatedWithToken = isAuthenticated && Boolean(accessToken);

  return (
    <Routes>
      <Route path="/" element={<PublicRoute><Login /></PublicRoute>} />
      
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/family-view" element={<FamilyView />} />
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
