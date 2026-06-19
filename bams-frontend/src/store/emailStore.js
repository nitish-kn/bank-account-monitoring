import { create } from "zustand";
import { useAuthStore } from "./authStore";
import api from "../lib/api";

export const useEmailStore = create((set, get) => ({
  emailData: null,
  loadingEmailData: false,
  error: null,

  // Parsed emails loaded from Google Sheets
  syncedEmails: [],
  loadingSynced: false,
  syncedError: null,
  hasFetchedSyncedEmails: false,
  syncedEmailsOwnerKey: null,

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

  fetchSyncedEmails: async ({ force = false } = {}) => {
    const { accessToken, isAuthenticated, user } = useAuthStore.getState();
    const ownerKey = user?.id || user?.google_id || user?.email || null;

    if (!isAuthenticated || !accessToken) {
      set({ syncedError: "User is not authenticated" });
      return;
    }

    const state = get();
    if (
      !force &&
      state.hasFetchedSyncedEmails &&
      state.syncedEmailsOwnerKey === ownerKey
    ) {
      return state.syncedEmails;
    }

    if (state.loadingSynced) {
      return state.syncedEmails;
    }

    set({ loadingSynced: true, syncedError: null });

    try {
      const response = await api.get("/setup/emails");

      set({
        syncedEmails: response?.data?.emails || [],
        hasFetchedSyncedEmails: true,
        syncedEmailsOwnerKey: ownerKey,
        loadingSynced: false,
      });
      return response?.data?.emails || [];
    } catch (err) {
      console.error("Failed to fetch synced emails:", err);
      const errMsg = err.response?.data?.detail || err.message || "Failed to fetch synced emails";
      set({
        syncedError: errMsg,
        loadingSynced: false,
      });
    }
  },

  resetSyncedEmails: () => set({
    emailData: null,
    loadingEmailData: false,
    error: null,
    syncedEmails: [],
    loadingSynced: false,
    syncedError: null,
    hasFetchedSyncedEmails: false,
    syncedEmailsOwnerKey: null,
  }),
}));
