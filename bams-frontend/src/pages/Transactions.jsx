import React, { useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { useSetupStore } from "../store/setupStore";
import { useEmailStore } from "../store/emailStore";
import { AllTransactions } from "../components/AllTransactions";

export function Transactions() {
  const { user, accessToken } = useAuthStore();
  const { isSyncing, syncMessage, lastSyncAt, syncDashboard } = useSetupStore();
  const { fetchSyncedEmails } = useEmailStore();
  
  const hasCompletedSetup = user?.is_setup_completed === true || user?.is_setup_completed === "true";
  const effectiveLastSyncAt = lastSyncAt || user?.last_synced_at;

  // Load already-synced sheet data whenever a completed user lands on the dashboard.
  useEffect(() => {
    if (!hasCompletedSetup || !accessToken) {
      return;
    }

    fetchSyncedEmails();
  }, [hasCompletedSetup, accessToken, fetchSyncedEmails]);

  return (
    <>
      <AllTransactions
        user={user}
        isSyncing={isSyncing}
        syncMessage={syncMessage}
        lastSyncAt={effectiveLastSyncAt}
        syncDashboard={syncDashboard}
      />
    </>
  );
}
