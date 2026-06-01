import api from "./api";

export const createInvites = async (emails) => {
  const response = await api.post("/invites", { emails });
  return response.data;
};

export const getPendingInvites = async () => {
  const response = await api.get("/invites/pending");
  return response.data;
};

export const getSentInvites = async () => {
  const response = await api.get("/invites/sent");
  return response.data;
};

export const acceptInvite = async (inviteId) => {
  const response = await api.post(`/invites/${inviteId}/accept`);
  return response.data;
};

export const declineInvite = async (inviteId) => {
  const response = await api.post(`/invites/${inviteId}/decline`);
  return response.data;
};
