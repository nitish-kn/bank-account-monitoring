import { create } from "zustand";

// Pages publish "what I'm currently showing" here (their applied filters,
// plus a date range / as-of date where relevant) so the globally-mounted
// Export Data dialog can default to exactly what the user is looking at,
// without prop-drilling filter state through Headers/Layout.
export const useExportContextStore = create((set) => ({
  bySource: {},

  setExportContext: (source, context) =>
    set((state) => ({
      bySource: { ...state.bySource, [source]: context },
    })),
}));
