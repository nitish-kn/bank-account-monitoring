import api from "../lib/api";

export const statementApi = {
  // The stored statement PDF as a Blob, for in-app preview. `key` is the
  // RustFS storage key (a transaction's parser_metadata.source_file_path).
  getStatementFile: async (key) => {
    const response = await api.get("/statements/file", {
      params: { key },
      responseType: "blob",
    });
    return response.data;
  },
};
