import api from "../lib/api";

export const transactionApi = {
  getFilterOptions: async () => {
    const response = await api.get("/transactions/filter-options");
    return response.data;
  },
  
  queryTransactions: async (filters, pagination, include) => {
    const response = await api.post("/transactions/query", {
      filters,
      pagination,
      include
    });
    return response.data;
  }
};
