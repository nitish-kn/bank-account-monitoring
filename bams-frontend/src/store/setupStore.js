import { create } from "zustand";
import { useAuthStore } from "./authStore";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import api from "../lib/api";
import { useEmailStore } from "./emailStore";

export const useSetupStore = create((set, get) => ({
  // State
  isSetupComplete: false,
  hasDismissedSetup: false,
  isLoading: false,
  error: null,
  progress: "idle", // Step name from backend
  message: "", // User-friendly progress message
  stepHistory: [], // Track all steps that are completed
  emailsCount: 0,
  rowsWritten: 0,
  isSyncing: false, // Track incremental sync status
  syncMessage: "", // Incremental sync message
  lastSyncAt: null,
  lastSyncStatus: null,
  lastSyncedEmailDate: null,
  abortController: null, // Keep reference to AbortController for cleanup
  hasAutoSyncedDashboard: false, // Track if we've auto-synced in this session

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

      const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";
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
                const { access_token, user } = refreshResponse?.data;
                useAuthStore.getState().login(user, access_token);

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
              // Update local user state in authStore to instantly unlock dashboard
              const currentUser = useAuthStore.getState().user;
              if (currentUser) {
                useAuthStore.getState().setUser({
                  ...currentUser,
                  is_setup_completed: true,
                  spreadsheet_id: data?.data?.spreadsheet_id || currentUser.spreadsheet_id,
                  last_synced_at: data?.data?.last_synced_at || currentUser.last_synced_at,
                  last_synced_status: data?.data?.last_synced_status || currentUser.last_synced_status,
                  last_synced_email_date: data?.data?.last_synced_email_date || currentUser.last_synced_email_date,
                });
              }

              set({
                isSetupComplete: true,
                hasDismissedSetup: false,
                isLoading: false,
                lastSyncAt: data?.data?.last_synced_at || new Date().toISOString(),
                lastSyncStatus: data?.data?.last_synced_status || "success",
                lastSyncedEmailDate: data?.data?.last_synced_email_date || null,
                abortController: null,
              });
              // Load newly parsed emails into the global emailStore
              useEmailStore.getState().fetchSyncedEmails();
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
      abortController: null,
      hasAutoSyncedDashboard: false,
    });
  },

  dismissSetupSuccess: () => set({ hasDismissedSetup: true }),
  setHasAutoSyncedDashboard: (value) => set({ hasAutoSyncedDashboard: value }),

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

    try {
      const response = await api.post("/setup/sync");

      set({
        isSyncing: false,
        syncMessage: response.data.message || "Sync completed!",
        emailsCount: response.data.new_rows || 0,
        lastSyncAt: response.data.last_synced_at || new Date().toISOString(),
        lastSyncStatus: response.data.last_synced_status || response.data.status,
        lastSyncedEmailDate: response.data.last_synced_email_date || null,
      });

      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        useAuthStore.getState().setUser({
          ...currentUser,
          last_synced_at: response.data.last_synced_at || currentUser.last_synced_at,
          last_synced_status: response.data.last_synced_status || currentUser.last_synced_status,
          last_synced_email_date: response.data.last_synced_email_date || currentUser.last_synced_email_date,
        });
      }

      // Load newly synced emails from sheets
      await useEmailStore.getState().fetchSyncedEmails();
      return response.data;
    } catch (err) {
      console.error("Syncing latest emails failed:", err);
      const errMsg = err.response?.data?.detail || err.message || "Sync failed";
      set({
        isSyncing: false,
        error: errMsg,
        syncMessage: "Sync failed.",
      });
    }
  },
}));
