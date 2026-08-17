import api from "../lib/api";

const FILENAME_PATTERN = /filename="?([^";]+)"?/i;

const extractFilename = (contentDisposition, fallback) => {
  const match = contentDisposition ? contentDisposition.match(FILENAME_PATTERN) : null;
  return match?.[1] || fallback;
};

export const exportApi = {
  getSources: async () => {
    const response = await api.get("/export/sources");
    return response.data;
  },

  download: async (source, format, { columns = [], filters = {} } = {}) => {
    const response = await api.post(
      "/export/download",
      { source, format, columns, filters },
      { responseType: "blob" },
    );

    const filename = extractFilename(
      response.headers["content-disposition"],
      `${source}-export.${format}`,
    );

    const blobUrl = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
  },
};
