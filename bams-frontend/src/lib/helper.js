export const getStatusColor = (status) => {
    const statusLower = status?.toLowerCase();

    if (statusLower === "failed") return "red";
    if (statusLower === "pending") return "amber";
    if (statusLower === "manual") return "orange";
    return "green";
}

export const cleanText = (value = "") => {
  return String(value)
    .replace(/[\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\.{3,}$/g, "")
    .trim();
};

export const truncateText = (value = "", maxLength = 80) => {
  const text = cleanText(value);

  if (!text) return "";

  return text.length > maxLength
    ? `${text.slice(0, maxLength).trim()}...`
    : text;
};

export const formatRelativeSyncTime = (syncedAt, now = new Date()) => {
  if (!syncedAt) return "";

  const syncedTime = new Date(syncedAt).getTime();
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();

  if (Number.isNaN(syncedTime) || Number.isNaN(currentTime)) return "";

  const elapsedSeconds = Math.max(0, Math.floor((currentTime - syncedTime) / 1000));

  if (elapsedSeconds < 60) return "Synced just now";

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `Synced ${elapsedMinutes} ${elapsedMinutes === 1 ? "min" : "mins"} ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `Synced ${elapsedHours} ${elapsedHours === 1 ? "hour" : "hours"} ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) {
    return `Synced ${elapsedDays} ${elapsedDays === 1 ? "day" : "days"} ago`;
  }

  return `Synced on ${new Date(syncedTime).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
};

export const getButtonText = (permissionsMissing, needsEmail, needsSheets) => {
  if (!permissionsMissing) return "All permissions granted - Starting setup...";
  if (needsEmail && needsSheets) return "Grant Gmail & Sheets Permissions";
  if (needsEmail) return "Grant Gmail Permission";
  return "Grant Sheets Permission";
};

export const isValidEmail = (email) => {
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return EMAIL_REGEX.test(email);
};

export const formatAmount = (amount) => {
  return Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const trimDecimals = (value) => {
  return Number(value.toFixed(2)).toString();
};

export const formatCompactINR = (amount) => {
  const value = Number(amount || 0);
  const absValue = Math.abs(value);

  let formatted;

  if (absValue >= 10000000) {
    formatted = `${trimDecimals(value / 10000000)}Cr`;
  } else if (absValue >= 100000) {
    formatted = `${trimDecimals(value / 100000)}L`;
  } else if (absValue >= 1000) {
    formatted = `${trimDecimals(value / 1000)}K`;
  } else {
    formatted = trimDecimals(value);
  }

  return `₹${formatted}`;
};

export const isValidDate = (dateValue) => {
  if (!dateValue) return false;

  const date = new Date(dateValue);
  return !Number.isNaN(date.getTime());
};

export const formatDate = (dateValue) => {
  if (!isValidDate(dateValue)) return "-";

  return new Date(dateValue).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const formatTime = (dateValue) => {
  if (!isValidDate(dateValue)) return "-";

  return new Date(dateValue).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatDateAndTime = (dateValue) => {
  if (!isValidDate(dateValue)) {
    return {
      date: "-",
      time: null,
    };
  }

  const hasTime = String(dateValue).includes("T");

  return {
    date: formatDate(dateValue),
    time: hasTime ? formatTime(dateValue) : null,
  };
};