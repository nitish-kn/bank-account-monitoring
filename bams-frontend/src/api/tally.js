import api from "../lib/api";

const CREDENTIALS_KEY = "tallyCredentials";

export const getTallyCredentials = () => {
  try {
    const value = JSON.parse(localStorage.getItem(CREDENTIALS_KEY));
    return value?.username && value?.password ? value : null;
  } catch {
    return null;
  }
};

export const saveTallyCredentials = (credentials) => {
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
  window.dispatchEvent(new Event("tally-credentials-changed"));
};

const requestConfig = (credentials = getTallyCredentials()) => {
  if (!credentials) throw new Error("Configure your Tally user first.");
  const bytes = new TextEncoder().encode(`${credentials.username}:${credentials.password}`);
  return { headers: { "X-Tally-Authorization": `Basic ${btoa(String.fromCharCode(...bytes))}` } };
};

export const tallyApi = {
  getHealth: async (credentials = getTallyCredentials()) => {
    const response = await api.get("/tally/health", credentials ? requestConfig(credentials) : {});
    return response.data;
  },
  getGroups: async () => {
    const response = await api.get("/tally/groups", requestConfig());
    return response.data;
  },
  createLedger: async (ledger) => {
    const response = await api.post("/tally/ledgers", ledger, requestConfig());
    return response.data;
  },
  getLedgers: async () => {
    const response = await api.get("/tally/ledgers", requestConfig());
    return response.data;
  },

  getCompanies: async () => {
    const response = await api.get("/tally/companies", requestConfig());
    return response.data;
  },

  importVouchers: async (dateRange) => {
    const body = { from_date: dateRange.startDate, to_date: dateRange.endDate };
    const response = await api.post("/tally/import", body, requestConfig());
    return response.data;
  },

  push: async (items) => {
    const response = await api.post("/tally/push", { items }, requestConfig());
    return response.data;
  },
};
