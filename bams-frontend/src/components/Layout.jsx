import React, { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Headers from "./Headers";
import { useAuthStore } from "../store/authStore";
import { useSetupStore } from "../store/setupStore";
import { useGoogleLogin } from "@react-oauth/google";
import api from "../lib/api";
import { SetupFlowOverlay } from "./SetupFlowOverlay";

const Layout = () => {
  const { user, accessToken, setUser } = useAuthStore();
  const { 
    isSyncing, lastSyncAt, syncDashboard, startSyncStatusPolling,
    initializeSetup, isLoading, error: setupError, message, stepHistory, 
    isSetupComplete, hasDismissedSetup, dismissSetupSuccess, retrySetup 
  } = useSetupStore();
  
  const [showMenu, setShowMenu] = useState(false);
  const effectiveLastSyncAt = lastSyncAt || user?.last_synced_at;
  const hasCompletedSetup = user?.is_setup_completed === true || user?.is_setup_completed === "true";
  const userSyncStatus = user?.sync_status || "not_started";
  const showMenuRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Determine which permissions are missing
  const hasEmailPermissions = user?.has_email_permissions === true || user?.has_email_permissions === "true";
  const hasSheetsPermissions = user?.has_sheets_permissions === true || user?.has_sheets_permissions === "true";
  const needsEmail = !hasEmailPermissions;
  const needsSheets = !hasSheetsPermissions;
  const permissionsMissing = needsEmail || needsSheets;

  // For the first time login - Auto-start setup when permissions are granted and the user has not completed setup yet
  useEffect(() => {
    if ( user && !hasCompletedSetup && !permissionsMissing && !isSetupComplete && !isLoading && !setupError ) {
      initializeSetup();
    }
  }, [ user, hasCompletedSetup, permissionsMissing, isSetupComplete, isLoading, setupError, initializeSetup, ]);

  // Keep progress polling alive for setup/manual syncs that are already running.
  // Returning users should sync only when they click the refresh button.
  useEffect(() => {
    if (!hasCompletedSetup || !accessToken || userSyncStatus !== "running") {
      return;
    }

    startSyncStatusPolling();
  }, [accessToken, hasCompletedSetup, startSyncStatusPolling, userSyncStatus]);

  // For users who haven't given permissions on login, Handle permission grant with both email and sheets scopes
  const handlePermissionGrant = async (code) => {
    setLoading(true);
    setError("");

    try {
      const response = await api.post("/auth/permission", { code });
      const updatedUser = response?.data?.user;
      setUser(updatedUser);
    } catch (err) {
      console.error("Permission grant failed:", err);
      setError("Unable to update permissions. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // For users who may have given half permissions on login, Request missing permissions
  const requestMissingPermissions = useGoogleLogin({
    flow: "auth-code",
    onSuccess: async (codeResponse) => {
      await handlePermissionGrant(codeResponse?.code);
    },
    onError: () => setError("Permission request failed. Please try again."),
    scope:
      "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets",
  });

  // Check if user is new or hasn't completed setup yet
  const showSetupOverlay = Boolean(
    user && (!hasCompletedSetup || (isSetupComplete && !hasDismissedSetup)),
  );

  // For sidebar to close in small screens, when user touches out of sidebar
  useEffect(() => {
    if (!showMenu) return undefined;

    const handleOutsideClick = (event) => {
      if (showMenuRef.current && !showMenuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [showMenu]);

  return (
    <div className="relative w-full min-h-screen">
      
      <div className="flex w-full">
        <div className="hidden lg:flex">
          <Sidebar picture={user?.picture} name={user?.name} lastSyncAt={effectiveLastSyncAt}/>
        </div>

        {showMenu && (
          <>
            {/* Dark overlay backdrop */}
            <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" />
            
            {/* Sidebar from the left */}
            <div ref={showMenuRef} className="fixed inset-y-0 left-0 bg-white shadow-xl z-50 lg:hidden animate-in slide-in-from-left-full duration-300">
              <Sidebar picture={user?.picture} name={user?.name} onClose={() => setShowMenu(false)} />
            </div>
          </>
        )}
        <div className="flex-1 flex flex-col min-h-screen bg-gray-200/50 overflow-hidden">
          <Headers
            isSyncing={isSyncing}
            lastSyncAt={effectiveLastSyncAt}
            syncDashboard={syncDashboard}
            setShowMenu={setShowMenu}
          />

          <main className="flex-1 p-3.5 overflow-y-auto">
            <Outlet />
          </main>
          
        </div>
      </div>
      
      {showSetupOverlay && (
        <SetupFlowOverlay
          user={user}
          permissionsMissing={permissionsMissing}
          needsEmail={needsEmail}
          needsSheets={needsSheets}
          loading={loading}
          error={error}
          requestMissingPermissions={requestMissingPermissions}
          isLoading={isLoading}
          message={message}
          stepHistory={stepHistory}
          setupError={setupError}
          retrySetup={retrySetup}
          isSetupComplete={isSetupComplete}
          onClose={() => dismissSetupSuccess()}
        />
      )}
    </div>
  );
};

export default Layout;
