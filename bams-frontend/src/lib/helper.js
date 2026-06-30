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
    minimumFractionDigits: 0,
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

const parseToISODate = (dateStr) => {
  if (!dateStr) return "";
  const normalized = String(dateStr).trim();
  
  const dmyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/;
  const match = normalized.match(dmyRegex);
  if (match) {
    const [_, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  const ymdRegex = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;
  const ymdMatch = normalized.match(ymdRegex);
  if (ymdMatch) {
    const [_, year, month, day] = ymdMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  try {
    const date = new Date(normalized);
    if (!isNaN(date.getTime())) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  } catch (e) {}

  return normalized.slice(0, 10);
};

const normalizeDateForJS = (dateValue) => {
  if (!dateValue) return "";
  const str = String(dateValue);
  
  if (str.includes("T")) {
    const [datePart, timePart] = str.split("T");
    return `${parseToISODate(datePart)}T${timePart}`;
  }
  
  if (str.includes(" ")) {
    const [datePart, timePart] = str.split(" ");
    return `${parseToISODate(datePart)}T${timePart}`;
  }
  
  return parseToISODate(str);
};

export const isValidDate = (dateValue) => {
  if (!dateValue) return false;
  const normalized = normalizeDateForJS(dateValue);
  const date = new Date(normalized);
  return !Number.isNaN(date.getTime());
};

export const formatDate = (dateValue) => {
  const normalized = normalizeDateForJS(dateValue);
  if (!isValidDate(normalized)) return "-";

  return new Date(normalized).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const formatTime = (dateValue) => {
  const normalized = normalizeDateForJS(dateValue);
  if (!isValidDate(normalized)) return "-";

  return new Date(normalized).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatDateAndTime = (dateValue) => {
  const normalized = normalizeDateForJS(dateValue);
  if (!isValidDate(normalized)) {
    return {
      date: "-",
      time: null,
    };
  }

  const hasTime = String(normalized).includes("T");

  return {
    date: formatDate(normalized),
    time: hasTime ? formatTime(normalized) : null,
  };
};