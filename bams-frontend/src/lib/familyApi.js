import api from "./api";

export const getFamilyMembers = async () => {
  const response = await api.get("/family/members");
  return response.data;
};

export const getFamilyEmails = async () => {
  const response = await api.get("/family/emails");
  return response.data;
};
