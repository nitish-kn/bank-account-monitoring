import api from "../lib/api";

export const chatApi = {
  listSessions: async (page = 1, pageSize = 20) => {
    const response = await api.get("/chat/sessions", { params: { page, pageSize } });
    return response.data;
  },

  createSession: async (title) => {
    const response = await api.post("/chat/sessions", title ? { title } : {});
    return response.data;
  },

  getMessages: async (sessionId, page = 1, pageSize = 100) => {
    const response = await api.get(`/chat/sessions/${sessionId}/messages`, {
      params: { page, pageSize },
    });
    return response.data;
  },

  sendMessage: async (sessionId, message) => {
    const response = await api.post(`/chat/sessions/${sessionId}/messages`, { message });
    return response.data;
  },

  deleteSession: async (sessionId) => {
    await api.delete(`/chat/sessions/${sessionId}`);
  },
};
