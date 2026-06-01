import { useAuthStore } from "../store/authStore";
import { ExitIcon } from "@radix-ui/react-icons";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import Cookies from "js-cookie";
import CustomButton from "./ui/CustomButton";

export function Logout({ className = "", text = "Sign Out", icon = <ExitIcon /> }) {
  const { logout, accessToken } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (error) {
      console.error("Backend logout error:", error);
    } finally {
      logout();
      localStorage.removeItem("auth-storage");
      Cookies.remove("access_token");
      navigate("/login");
    }
  };

  return (
    <CustomButton
      onClick={handleLogout}
      className={`shrink-0 justify-center ${className}`}
      variant="outline"
      size="3"
    >
      {icon} {text}
    </CustomButton>
  );
}