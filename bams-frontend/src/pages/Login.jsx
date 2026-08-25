import React, { useState } from "react";
import { Landmark, Lock, Eye, EyeOff, User, ShieldCheck } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useGoogleLogin } from "@react-oauth/google";
import api from "../lib/api";
import GoogleIcon from "../components/ui/GoogleIcon";
import CustomButton from "../components/ui/CustomButton";
import CustomInput from "../components/ui/CustomInput";
import LoginLoading from "../components/ui/LoginLoading";

const Login = () => {
  const { login } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  // Email/password sign-in for sub-users an admin created. The org owner has
  // no password and signs in with the Google button below instead.
  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await api.post("/auth/login", { email: username, password });
      login(response?.data, response?.data?.access_token);
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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

        // Save backend session token / identity / permissions to the store
        login(backendData, backendData?.access_token);
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
    <main className="flex min-h-screen bg-white font-sans">

      <div className="w-3/4 h-dvh"> 
        <img src="/login.png" alt="Login" className="w-full h-full object-cover" />
      </div>


      <section className="flex w-full flex-col items-center justify-center px-20">
        
        <div className="w-full sm:max-w-md">
          
          {/* Logo */}
          <div className="flex justify-center items-center gap-2">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600">
              <Landmark className="h-7 w-7 text-white" />
            </span>
            
            {/* <p className="font-semibold text-4xl text-gray-800 tracking-wide text-shadow-sm">BAMS</p> */}
          </div>

          {/* Heading text */}
          <h1 className="mt-5 text-center text-2xl font-bold text-gray-900"> Welcome back </h1>
          <p className="mt-1 text-center text-sm text-gray-500"> Sign in to continue to your account </p>


          <p className="mt-6 text-xs font-semibold tracking-wide text-gray-400 uppercase text-center">
            Sign in as a user
          </p>

          <form onSubmit={handlePasswordSubmit} className="mt-2 space-y-4">
            {/* Email input */}
            <CustomInput
              id="username"
              type="email"
              labelText="Email"
              placeholder="Enter your email"
              value={username}
              onChange={setUsername}
              icon={User}
              inputClassName="h-10"
            />

            {/* Password input */}
            <CustomInput
              id="password"
              type={showPassword ? "text" : "password"}
              labelText="Password"
              placeholder="Enter your password"
              value={password}
              onChange={setPassword}
              icon={Lock}
              inputClassName="h-10"
              endAdornment={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>
            )}

            <CustomButton type="submit" size="3" className="w-full! h-12! mt-1 justify-center">
              Sign in
            </CustomButton>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <span className="h-px flex-1 bg-gray-200" />
          </div>

          <p className="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase text-center">
            Sign in as an organisation or owner (Google account)
          </p>

          <CustomButton
            onClick={handleLogin}
            variant="surface"
            color="gray"
            size="3"
            className="w-full! h-12! justify-center shadow-lg!"
          >
            <GoogleIcon /> Sign in with Google
          </CustomButton>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Secure, encrypted, and protected
          </p>

        </div>
      </section>
    </main>
  );
};

export default Login;
