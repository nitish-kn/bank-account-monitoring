import React, { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { useGoogleLogin } from "@react-oauth/google";
import api from "../lib/api";
import GoogleIcon from "../components/ui/GoogleIcon";
import CustomButton from "../components/ui/CustomButton";
import LoginLoading from "../components/ui/LoginLoading";

const Login = () => {
  const { login } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const handleLogin = useGoogleLogin({
    flow: "auth-code",
    onSuccess: async (codeResponse) => {
      setLoading(true);
      try {
        // Send auth code to the Python backend to exchange for tokens
        const response = await api.post("/auth/google", {
          code: codeResponse.code,
        });

        const backendData = response?.data;

        // Save backend session token / user info globally to store
        login(backendData?.user, backendData?.access_token);
      } catch (error) {
        console.error("Failed to authenticate with backend:", error);
      } finally {
        setLoading(false);
      }
    },

    // Request both email and sheets permissions at login
    // User can grant all, some, or none - they can grant missing ones later from dashboard
    scope:
      "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets",
  });

  if (loading) {
    return (
      <LoginLoading />
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col justify-center items-center gap-4 font-sans px-4">
      <p className="text-lg font-medium text-gray-600 text-center max-w-md">
        Sign in to connect your Gmail and Google Sheets.
      </p>

      <CustomButton
        onClick={handleLogin}
        variant="surface"
        size="3"
      >
        <GoogleIcon /> Sign in with Google
      </ CustomButton>
    </main>
  );
};

export default Login;
