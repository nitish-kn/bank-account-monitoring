import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@radix-ui/themes/styles.css";
import "./index.css";
import App from "./App.jsx";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { BrowserRouter } from "react-router-dom";
import { Theme } from "@radix-ui/themes";
import { setupAxiosInterceptors } from "./lib/axiosInterceptors";

// Setup axios interceptors for authentication and token refresh
setupAxiosInterceptors();

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <GoogleOAuthProvider clientId={clientId}>
      <Theme>
        <App />
      </Theme>
    </GoogleOAuthProvider>
  </BrowserRouter>,
);
