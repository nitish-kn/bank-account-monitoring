import { create } from "zustand";
import { useAuthStore } from "./authStore";
import api from "../lib/api";

export const useEmailStore = create((set) => ({
  emailData: null,
  loadingEmailData: false,
  error: null,

  // Parsed emails loaded from Google Sheets
  syncedEmails: [],
  loadingSynced: false,
  syncedError: null,

  fetchEmailData: async () => {
    const { accessToken, isAuthenticated, user } = useAuthStore.getState();
    const hasEmailPermission = user?.has_email_permissions;

    if (!isAuthenticated || !accessToken || !hasEmailPermission) {
      set({ error: "User is not authenticated or does not have email permissions" });
      return;
    }

    set({ loadingEmailData: true, error: null });

    try {
      const response = await api.post("/gmail/fetch");

      set({ emailData: response?.data, loadingEmailData: false });
    } catch (error) {
      set({ error: "Failed to fetch email data", loadingEmailData: false });
    }
  },

  fetchSyncedEmails: async () => {
    const { accessToken, isAuthenticated } = useAuthStore.getState();

    if (!isAuthenticated || !accessToken) {
      set({ syncedError: "User is not authenticated" });
      return;
    }

    set({ loadingSynced: true, syncedError: null });

    try {
      const response = await api.get("/setup/emails");

      set({
        syncedEmails: response?.data?.emails || [],
        loadingSynced: false,
      });
    } catch (err) {
      console.error("Failed to fetch synced emails:", err);
      const errMsg = err.response?.data?.detail || err.message || "Failed to fetch synced emails";
      set({
        syncedError: errMsg,
        loadingSynced: false,
      });
    }
  },
}));
