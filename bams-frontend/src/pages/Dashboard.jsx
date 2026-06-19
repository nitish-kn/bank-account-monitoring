import React, { useState, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { useSetupStore } from "../store/setupStore";
import { useGoogleLogin } from "@react-oauth/google";
import api from "../lib/api";
import { MainDashboard } from "../components/MainDashboard";
import { SetupFlowOverlay } from "../components/SetupFlowOverlay";
import { useEmailStore } from "../store/emailStore";

export function Dashboard() {
  const { user, accessToken, setUser } = useAuthStore();
  const { initializeSetup, isLoading, error: setupError, message, stepHistory, isSetupComplete, hasDismissedSetup, dismissSetupSuccess, retrySetup, isSyncing, syncMessage, lastSyncAt, syncDashboard,} = useSetupStore();
  const { fetchSyncedEmails } = useEmailStore();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Determine which permissions are missing
  const hasEmailPermissions = user?.has_email_permissions === true || user?.has_email_permissions === "true";
  const hasSheetsPermissions = user?.has_sheets_permissions === true || user?.has_sheets_permissions === "true";
  const needsEmail = !hasEmailPermissions;
  const needsSheets = !hasSheetsPermissions;

  const permissionsMissing = needsEmail || needsSheets;
  const hasCompletedSetup = user?.is_setup_completed === true || user?.is_setup_completed === "true";
  const effectiveLastSyncAt = lastSyncAt || user?.last_synced_at;



  // For the first time login - Auto-start setup when permissions are granted and the user has not completed setup yet
  useEffect(() => {
    if ( user && !hasCompletedSetup && !permissionsMissing && !isSetupComplete && !isLoading && !setupError ) {
      initializeSetup();
    }
  }, [ user, hasCompletedSetup, permissionsMissing, isSetupComplete, isLoading, setupError, initializeSetup, ]);



  // Load already-synced sheet data whenever a completed user lands on the dashboard.
  useEffect(() => {
    if (!hasCompletedSetup || !accessToken) {
      return;
    }

    fetchSyncedEmails();
  }, [hasCompletedSetup, accessToken, fetchSyncedEmails]);



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



  // For users who may have given half permissions on login,Request missing permissions
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


  
  return (
    <>
      <MainDashboard
        user={user}
        isSyncing={isSyncing}
        syncMessage={syncMessage}
        lastSyncAt={effectiveLastSyncAt}
        syncDashboard={syncDashboard}
      />

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
    </>
  );
}
