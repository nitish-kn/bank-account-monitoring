import React from "react";
import { useAuthStore } from "../store/authStore";
import { useSetupStore } from "../store/setupStore";
import { AllTransactions } from "../components/AllTransactions";

export function Transactions() {
  const { user } = useAuthStore();
  const { isSyncing, syncMessage, lastSyncAt, syncDashboard } = useSetupStore();
  
  const effectiveLastSyncAt = lastSyncAt || user?.last_synced_at;

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
