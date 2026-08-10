import api from "../lib/api";

export const accountsApi = {
  queryAccounts: async (filters, pagination, sort) => {
    const response = await api.post("/accounts/query", {
      filters,
      pagination,
      sort,
    });
    return response.data;
  },

  createAccounts: async (body) => {
    const response = await api.post("/accounts", body);

    return response?.data;
  },

  getRecentTransactions: async (accountId, limit = 5) => {
    const response = await api.get(`/accounts/${accountId}/transactions`, {
      params: { limit },
    });

    return response.data;
  },
};
