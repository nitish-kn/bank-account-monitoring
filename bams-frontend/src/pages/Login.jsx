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
  const [activeTab, setActiveTab] = useState("org");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Email/password sign-in isn't wired to a backend yet — this app only
  // authenticates through Google. These fields exist for now as a visual
  // placeholder for that future flow, so submitting just does nothing.
  const handlePlaceholderSubmit = (event) => {
    event.preventDefault();
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

        // Save backend session token / org info globally to store
        login(backendData?.org, backendData?.access_token);
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
          <div className="flex justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600">
              <Landmark className="h-7 w-7 text-white" />
            </span>
          </div>

          {/* Heading text */}
          <h1 className="mt-5 text-center text-2xl font-bold text-gray-900"> Welcome back </h1>
          <p className="mt-1 text-center text-sm text-gray-500"> Sign in to continue to your account </p>


          {/* User / Organization switch */}
          <div className="mt-6 flex items-center gap-1 rounded-full bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("user")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2 text-sm font-medium transition ${
                activeTab === "user"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <User className="h-4 w-4" /> User
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("org")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2 text-sm font-medium transition ${
                activeTab === "org"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Landmark className="h-4 w-4" /> Organization
            </button>
          </div>

          {/* Both panels are stacked in the same grid cell so the container's
              height always matches the taller one — switching tabs only
              toggles visibility, never how much space is reserved. */}
          <div className="mt-6 grid">
            <form
              onSubmit={handlePlaceholderSubmit}
              aria-hidden={activeTab !== "user"}
              className={`col-start-1 row-start-1 space-y-4 ${
                activeTab === "user" ? "visible opacity-100" : "invisible opacity-0 pointer-events-none"
              }`}
            >
              {/* Username input */}
              <CustomInput
                id="username"
                type="text"
                labelText="Username"
                placeholder="Enter your username"
                value={username}
                onChange={setUsername}
                icon={User}
                inputClassName="h-10"
                tabIndex={activeTab === "user" ? undefined : -1}
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
                tabIndex={activeTab === "user" ? undefined : -1}
                endAdornment={
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={activeTab === "user" ? undefined : -1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-gray-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    tabIndex={activeTab === "user" ? undefined : -1}
                  />
                  Remember me
                </label>
              </div>

              <CustomButton
                type="submit"
                size="3"
                className="w-full! h-12! mt-1 justify-center"
                tabIndex={activeTab === "user" ? undefined : -1}
              >
                Sign in
              </CustomButton>
            </form>

            <div
              aria-hidden={activeTab !== "org"}
              className={`col-start-1 row-start-1 flex flex-col gap-4 items- justify-center text-center text-sm text-gray-500 ${
                activeTab === "org" ? "visible opacity-100" : "invisible opacity-0 pointer-events-none"
              }`}
            >


              <p className="text-gray-400 mb-4">Organization accounts sign in with Google below.</p>

              
              <CustomButton
                onClick={handleLogin}
                variant="surface"
                color="gray"
                size="3"
                className="w-full! h-12! justify shadow-lg!"
              >
                <GoogleIcon /> Sign in with Google
              </CustomButton>
            </div>
          </div>


          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Secure, encrypted, and protected
          </p>

        </div>
      </section>
    </main>
  );
};

export default Login;
