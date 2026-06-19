import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_TRANSACTION_FILTERS,
  getDefaultTransactionDateRange,
} from "../lib/transactional-helper";

const getDefaultDateRange = () => getDefaultTransactionDateRange(new Date(), 7);

const normalizeFilters = (filters = {}) => ({
  ...DEFAULT_TRANSACTION_FILTERS,
  ...filters,
});

const normalizeDateRange = (dateRange = {}) => ({
  ...getDefaultDateRange(),
  ...dateRange,
});

export const useDashboardFilterStore = create(
  persist(
    (set) => ({
      filters: DEFAULT_TRANSACTION_FILTERS,
      dateRange: getDefaultDateRange(),

      applyFilters: (filters) => set({
        filters: normalizeFilters(filters),
      }),

      resetFilters: () => set({
        filters: DEFAULT_TRANSACTION_FILTERS,
      }),

      setDateRange: (dateRange) => set({
        dateRange: normalizeDateRange(dateRange),
      }),

      resetDateRange: () => set({
        dateRange: getDefaultDateRange(),
      }),

      resetDashboardFilters: () => set({
        filters: DEFAULT_TRANSACTION_FILTERS,
        dateRange: getDefaultDateRange(),
      }),
    }),
    {
      name: "dashboard-filter-state",
      partialize: (state) => ({
        filters: state.filters,
        dateRange: state.dateRange,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        filters: normalizeFilters(persistedState?.filters),
        dateRange: normalizeDateRange(persistedState?.dateRange),
      }),
    },
  ),
);
