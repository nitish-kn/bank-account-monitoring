import api from "../lib/api";

export const rbacApi = {
  getMe: async () => (await api.get("/auth/me")).data,

  listUsers: async () => (await api.get("/users")).data,
  createUser: async (body) => (await api.post("/users", body)).data,
  updateUser: async (id, body) => (await api.put(`/users/${id}`, body)).data,
  deleteUser: async (id) => (await api.delete(`/users/${id}`)).data,
  revealPassword: async (id) => (await api.get(`/users/${id}/password`)).data,

  // Returns { roles, permissions } -- the matrix needs both together.
  listRoles: async () => (await api.get("/roles")).data,
  createRole: async (body) => (await api.post("/roles", body)).data,
  updateRole: async (id, body) => (await api.put(`/roles/${id}`, body)).data,
  setRolePermissions: async (id, permissionIds) =>
    (await api.put(`/roles/${id}/permissions`, { permission_ids: permissionIds })).data,
  deleteRole: async (id) => (await api.delete(`/roles/${id}`)).data,
};
