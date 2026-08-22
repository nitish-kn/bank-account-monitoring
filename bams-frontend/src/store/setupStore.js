import { create } from "zustand";
import { useAuthStore } from "./authStore";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import api from "../lib/api";
import { toast } from "react-toastify";

const SYNC_STATUS_RUNNING = "running";
const SYNC_STATUS_COMPLETED = "completed";
const SYNC_STATUS_FAILED = "failed";
const SYNC_POLL_INTERVAL_MS = 15000;
const DASHBOARD_REFRESH_INTERVAL_MS = 30000;
const SYNC_START_TOAST_ID = "latest-email-sync-started";
const SYNC_COMPLETE_TOAST_ID = "latest-email-sync-complete";
const SYNC_FAILED_TOAST_ID = "latest-email-sync-failed";

const getSyncCompleteMessage = (payload = {}) => {
  const rowsAdded = Number(
    payload.new_rows ?? payload.rows_written ?? payload.rows ?? 0,
  );

  if (rowsAdded > 0) {
    return `${rowsAdded} new ${rowsAdded === 1 ? "transaction" : "transactions"} added.`;
  }

  const message = String(payload.message || "").trim();
  if (message.toLowerCase().includes("up to date")) {
    return "Dashboard is already up to date.";
  }

  return "Email sync complete. Dashboard data refreshed.";
};

const showSyncStartedToast = () => {
  toast.dismiss(SYNC_COMPLETE_TOAST_ID);
  toast.dismiss(SYNC_FAILED_TOAST_ID);
  toast.info("Latest email sync started.", {
    toastId: SYNC_START_TOAST_ID,
  });
};

const showSyncCompleteToast = (payload) => {
  toast.dismiss(SYNC_START_TOAST_ID);
  toast.success(getSyncCompleteMessage(payload), {
    toastId: SYNC_COMPLETE_TOAST_ID,
  });
};

const showSyncFailedToast = (message = "Email sync failed.") => {
  toast.dismiss(SYNC_START_TOAST_ID);
  toast.error(message, {
    toastId: SYNC_FAILED_TOAST_ID,
  });
};

export const useSetupStore = create((set, get) => ({
  // States
  isSetupComplete: false,
  hasDismissedSetup: false,
  isLoading: false,
  error: null,
  progress: "idle",               // Step name from backend
  message: "",                    // User-friendly progress message
  stepHistory: [],                // Track all steps that are completed
  emailsCount: 0,
  rowsWritten: 0,
  isSyncing: false,               // Track incremental sync status
  syncMessage: "",                // Incremental sync message
  lastSyncAt: null,
  lastSyncStatus: null,
  lastSyncedEmailDate: null,
  syncStatus: null,
  abortController: null,          // Keep reference to AbortController for cleanup
  refreshTrigger: 0,
  triggerRefresh: () => set((state) => ({ refreshTrigger: state.refreshTrigger + 1 })),
  syncPollIntervalId: null,
  lastDashboardRefreshAt: 0,
  hasAutoSyncedDashboard: false,  // Track if we've auto-synced in this session

  // Initialize setup via SSE
  initializeSetup: async () => {
    const { accessToken, isAuthenticated } = useAuthStore.getState();

    if (!isAuthenticated || !accessToken) {
      set({ error: "Not authenticated" });
      return;
    }

    // Only run setup once per session
    if (get().isSetupComplete) {
      return;
    }

    set({
      isLoading: true,
      error: null,
      progress: "starting",
      message: "Starting syncing...",
      stepHistory: [],
    });

    try {
      // Close any existing connection
      const existingController = get().abortController;
      if (existingController) {
        existingController.abort();
      }

      // Create AbortController for fetchEventSource
      const abortController = new AbortController();
      set({ abortController });

      const baseUrl = import.meta.env.VITE_API_BASE_URL;
      
      // Start SSE from here
      await fetchEventSource(`${baseUrl}/setup/stream`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "text/event-stream",
        },
        signal: abortController.signal,
        
        async onopen(response) {
          if (response.status === 401) {
            const expiredToken = useAuthStore.getState().accessToken;
            if (expiredToken) {
              try {
                const refreshResponse = await api.post("/auth/refresh", {
                  token: expiredToken,
                });
                const { access_token, org } = refreshResponse?.data;
                useAuthStore.getState().login(org, access_token);

                // Re-initialize setup asynchronously with the new token
                setTimeout(() => {
                  get().initializeSetup();
                }, 100);

                throw new Error(
                  "Token expired; refreshed successfully, reconnecting...",
                );
              } catch (refreshErr) {
                console.error(
                  "Token refresh failed during setup stream:",
                  refreshErr,
                );
              }
            }
            useAuthStore.getState().logout();
            throw new Error("Session expired. Please log in again.");
          }
          if ( response.status >= 400 && response.status < 500 && response.status !== 429) {
            throw new Error(
              `Fatal setup stream error: HTTP ${response.status}`,
            );
          }
        },

        async onmessage(ev) {
          try {
            const data = JSON.parse(ev?.data);
            const { step, message, status } = data;

            // Add to history
            set((state) => ({
              stepHistory: [
                ...state.stepHistory,
                { step, message, timestamp: new Date() },
              ],
            }));

            // Update current progress
            set((state) => ({
              progress: step,
              message: message || "",
              emailsCount: data?.count !== undefined ? data?.count : state.emailsCount,
              rowsWritten: data?.rows !== undefined ? data?.rows : state.rowsWritten,
            }));

            // Handle completion
            if (step === "complete" && status === "success") {
              // Update local org state in authStore to instantly unlock dashboard
              const currentOrg = useAuthStore.getState().org;
              if (currentOrg) {
                useAuthStore.getState().setOrg({
                  ...currentOrg,
                  is_setup_completed: true,
                  spreadsheet_id: data?.data?.spreadsheet_id || currentOrg.spreadsheet_id,
                  last_synced_at: data?.data?.last_synced_at || currentOrg.last_synced_at,
                  last_synced_status: data?.data?.last_synced_status || currentOrg.last_synced_status,
                  last_synced_email_date: data?.data?.last_synced_email_date || currentOrg.last_synced_email_date,
                  sync_status: data?.data?.sync_status || currentOrg.sync_status,
                });
              }

              const syncStatus = data?.data?.sync_status || SYNC_STATUS_RUNNING;
              const isBackgroundSyncRunning = syncStatus === SYNC_STATUS_RUNNING;

              set({
                isSetupComplete: true,
                hasDismissedSetup: false,
                isLoading: false,
                lastSyncAt: data?.data?.last_synced_at || new Date().toISOString(),
                lastSyncStatus: data?.data?.last_synced_status || syncStatus,
                lastSyncedEmailDate: data?.data?.last_synced_email_date || null,
                syncStatus,
                isSyncing: isBackgroundSyncRunning,
                syncMessage: isBackgroundSyncRunning
                  ? "Initial email sync is running..."
                  : "Setup complete.",
                abortController: null,
              });

              get().triggerRefresh();
              if (isBackgroundSyncRunning) {
                showSyncStartedToast();
                get().startSyncStatusPolling();
              }
              abortController.abort();
            }

            // Handle errors
            if (step === "error" && status === "failed") {
              set({
                error: message,
                isLoading: false,
                abortController: null,
              });
              abortController.abort();
            }
          } catch (err) {
            console.error("Failed to parse SSE message:", err);
          }
        },
        onerror(err) {
          const errMsg = err.message || "Connection lost during setup";
          set({
            error: errMsg,
            isLoading: false,
            abortController: null,
          });
          throw err; // Stop retrying and propagate error to close connection
        },
      });
    } catch (error) {
      if (!get().error) {
        set({
          error: error.message || "Setup failed to start",
          isLoading: false,
        });
      }
    }
  },

  // Retry setup if it failed
  retrySetup: async () => {
    set({ isSetupComplete: false, hasDismissedSetup: false });
    await get().initializeSetup();
  },

  // Reset setup state (for logout)
  resetSetup: () => {
    const existingController = get().abortController;
    if (existingController) {
      existingController.abort();
    }
    const syncPollIntervalId = get().syncPollIntervalId;
    if (syncPollIntervalId) {
      window.clearInterval(syncPollIntervalId);
    }

    set({
      isSetupComplete: false,
      hasDismissedSetup: false,
      isLoading: false,
      error: null,
      progress: "idle",
      message: "",
      stepHistory: [],
      emailsCount: 0,
      rowsWritten: 0,
      isSyncing: false,
      syncMessage: "",
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncedEmailDate: null,
      syncStatus: null,
      abortController: null,
      syncPollIntervalId: null,
      lastDashboardRefreshAt: 0,
      hasAutoSyncedDashboard: false,
    });
  },

  dismissSetupSuccess: () => set({ hasDismissedSetup: true }),
  setHasAutoSyncedDashboard: (value) => set({ hasAutoSyncedDashboard: value }),

  stopSyncStatusPolling: () => {
    const intervalId = get().syncPollIntervalId;
    if (intervalId) {
      window.clearInterval(intervalId);
    }
    set({ syncPollIntervalId: null });
  },

  // Get the status of the sync setup of new user for first time login, if the syncing is ongoing or complete 
  fetchSyncStatus: async () => {
    try {
      const response = await api.get("/setup/sync-status");
      const data = response.data || {};
      const syncStatus = data.sync_status || "not_started";
      const isRunning = syncStatus === SYNC_STATUS_RUNNING;
      const isCompleted = syncStatus === SYNC_STATUS_COMPLETED;
      const isFailed = syncStatus === SYNC_STATUS_FAILED;
      const currentOrgSyncStatus = useAuthStore.getState().org?.sync_status;
      const wasSyncing = get().isSyncing;
      const wasKnownRunning =
        wasSyncing ||
        get().syncStatus === SYNC_STATUS_RUNNING ||
        currentOrgSyncStatus === SYNC_STATUS_RUNNING;

      if (isRunning && !wasSyncing) {
        showSyncStartedToast();
      }

      if (isCompleted && wasKnownRunning) {
        showSyncCompleteToast(data);
      }

      if (isFailed && wasKnownRunning) {
        showSyncFailedToast();
      }

      set({
        syncStatus,
        isSyncing: isRunning,
        syncMessage: isRunning
          ? "Syncing latest emails..."
          : isCompleted
            ? "Sync complete."
            : isFailed
              ? "Sync failed."
              : "",
        lastSyncAt: data.last_synced_at || get().lastSyncAt,
        lastSyncStatus: data.last_synced_status || get().lastSyncStatus,
        lastSyncedEmailDate: data.last_synced_email_date || get().lastSyncedEmailDate,
      });

      const currentOrg = useAuthStore.getState().org;
      if (currentOrg) {
        useAuthStore.getState().setOrg({
          ...currentOrg,
          sync_status: syncStatus,
          last_synced_at: data.last_synced_at || currentOrg.last_synced_at,
          last_synced_status: data.last_synced_status || currentOrg.last_synced_status,
          last_synced_email_date: data.last_synced_email_date || currentOrg.last_synced_email_date,
        });
      }

      const now = Date.now();
      
      // It checks when was last time the dashboard was refreshed, if the time is more that interval window, it'll run again
      if (isRunning && now - get().lastDashboardRefreshAt > DASHBOARD_REFRESH_INTERVAL_MS) {
        set({ lastDashboardRefreshAt: now });

        // Call the email refresh
        get().triggerRefresh();
      }

      if (isCompleted || isFailed) {
        get().stopSyncStatusPolling();
        if (isCompleted) {

          // Call the email refresh
          get().triggerRefresh();
        }
      }

      return data;
    } catch (err) {
      console.error("Failed to fetch sync status:", err);
      return null;
    }
  },

  // Polling to check the status of the syncing for new user or first time login
  // The main call for fetchSyncStatus function happens here, 
  startSyncStatusPolling: () => {
    if (get().syncPollIntervalId) {
      return;
    }


    const intervalId = window.setInterval(() => {
      get().fetchSyncStatus();
    }, SYNC_POLL_INTERVAL_MS);

    set({ syncPollIntervalId: intervalId });
    get().fetchSyncStatus();
  },

  // Perform incremental sync for returning users, fetch emails from sheets to global state
  syncDashboard: async () => {
    const { accessToken, isAuthenticated } = useAuthStore.getState();

    if (!isAuthenticated || !accessToken) {
      set({ error: "Not authenticated" });
      return;
    }

    set({
      isSyncing: true,
      error: null,
      syncMessage: "Syncing latest emails...",
    });
    showSyncStartedToast();

    try {
      const response = await api.post("/setup/sync");
      const syncStatus = response.data.sync_status || response.data.status;
      const isRunning = syncStatus === SYNC_STATUS_RUNNING;

      set({
        isSyncing: isRunning,
        syncStatus,
        syncMessage: response.data.message || (isRunning ? "Background sync is already running..." : "Sync complete."),
        emailsCount: 0,
        lastSyncAt: response.data.last_synced_at || get().lastSyncAt,
        lastSyncStatus: response.data.last_synced_status || response.data.status,
        lastSyncedEmailDate: response.data.last_synced_email_date || null,
      });

      const currentOrg = useAuthStore.getState().org;
      if (currentOrg) {
        useAuthStore.getState().setOrg({
          ...currentOrg,
          last_synced_at: response.data.last_synced_at || currentOrg.last_synced_at,
          last_synced_status: response.data.last_synced_status || currentOrg.last_synced_status,
          last_synced_email_date: response.data.last_synced_email_date || currentOrg.last_synced_email_date,
          sync_status: syncStatus || currentOrg.sync_status,
        });
      }

      if (isRunning) {
        get().startSyncStatusPolling();
      } else {
        if (syncStatus === SYNC_STATUS_FAILED) {
          showSyncFailedToast(response.data.message || "Email sync failed.");
        } else {
          showSyncCompleteToast(response.data);
        }
        get().triggerRefresh();
      }

      return response.data;
    } catch (err) {
      console.error("Syncing latest emails failed:", err);
      const errMsg = err.response?.data?.detail || err.message || "Sync failed";
      set({
        isSyncing: false,
        error: errMsg,
        syncMessage: "Sync failed.",
      });
      showSyncFailedToast(errMsg);
    }
  },
}));
