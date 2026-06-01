import { create } from "zustand";
import { getFamilyMembers, getFamilyEmails } from "../lib/familyApi";

export const useFamilyStore = create((set) => ({
  familyMembers: [],
  familyInfo: null,
  loadingFamilyMembers: false,
  error: null,
  hasLoadedFamilyData: false,

  // Family shared emails
  familyEmails: [],
  loadingFamilyEmails: false,
  familyEmailsError: null,
  failedMembers: [],

  fetchFamilyMembers: async () => {
    set({ loadingFamilyMembers: true, error: null });

    try {
      const data = await getFamilyMembers();

      set({
        familyInfo: data?.family || null,
        familyMembers: data?.members || [],
        loadingFamilyMembers: false,
      });
    } catch (error) {
      set({
        error: error.response?.data?.detail || "Failed to load family members",
        loadingFamilyMembers: false,
      });
    }
  },

  fetchFamilyEmails: async () => {
    set({ loadingFamilyEmails: true, familyEmailsError: null });

    try {
      const data = await getFamilyEmails();

      set({
        familyEmails: data?.emails || [],
        failedMembers: data?.failed_members || [],
        loadingFamilyEmails: false,
      });
    } catch (error) {
      set({
        familyEmailsError: error.response?.data?.detail || "Failed to load family emails",
        familyEmails: [],
        failedMembers: [],
        loadingFamilyEmails: false,
      });
    }
  },

  markFamilyDataLoaded: () => set({ hasLoadedFamilyData: true }),

  clearFamilyData: () => set({
    familyMembers: [],
    familyInfo: null,
    error: null,
    hasLoadedFamilyData: false,
    familyEmails: [],
    familyEmailsError: null,
    failedMembers: [],
  }),
}));

