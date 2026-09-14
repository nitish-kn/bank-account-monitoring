import api from "../lib/api";

export const transactionApi = {
  getFilterOptions: async () => {
    const response = await api.get("/transactions/filter-options");
    return response.data;
  },
  
  queryTransactions: async (filters, pagination, include, sort) => {
    const response = await api.post("/transactions/query", {
      filters,
      pagination,
      include,
      sort
    });
    return response.data;
  },

  editTransaction: async (id, body) => {
    const response = await api.put(`/transactions/${id}`, body);
    return response.data;
  },

  getAuditLogs: async (params) => {
    const response = await api.get("/transactions/audit-log", { params });
    return response.data;
  },

  queryFlagged: async (filters, pagination, sort) => {
    const response = await api.post("/transactions/flagged", { filters, pagination, sort });
    return response.data;
  },

  unflagTransactions: async (ids) => {
    const response = await api.post("/transactions/unflag", { ids });
    return response.data;
  },
};
