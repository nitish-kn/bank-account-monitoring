import { formatDate } from "./helper";

// formatDate() returns "-" (not falsy) for an empty value, so callers that
// want an "any"-style fallback need to check the raw value first.
const formatDateOrFallback = (value, fallback) => (value ? formatDate(value) : fallback);

// Mirrors app/services/export_service.py's FILTER_LABELS_BY_SOURCE /
// _describe_filters - same filter keys, same wording, so the dialog shows
// exactly what the PDF cover page and export will actually reflect.
const TRANSACTION_FILTER_LABELS = {
  search: "Search",
  bank: "Bank",
  account: "Account Number",
  txnType: "Transaction Type",
  mode: "Mode",
  category: "Category",
  currency: "Currency",
  accountHolderName: "Account Holder",
  accountType: "Account Type",
  status: "Status",
  entity: "Entity",
  individualAccount: "Individual Account",
};
const ACCOUNT_FILTER_LABELS = {
  search: "Search",
  account: "Account Number",
  bank: "Bank",
  accountType: "Account Type",
  category: "Category",
  accountHolderName: "Account Holder",
  individualAccount: "Individual Account",
};
const AUDIT_LOG_FILTER_LABELS = {
  search: "Search",
  changed_by: "Operator",
};
const FILTER_LABELS_BY_SOURCE = {
  transactions: TRANSACTION_FILTER_LABELS,
  accounts: ACCOUNT_FILTER_LABELS,
  "audit-log": AUDIT_LOG_FILTER_LABELS,
};

export const DATE_LABEL_BY_SOURCE = {
  transactions: "Date Range",
  accounts: "As Of",
  "audit-log": "Date Range",
};

const activeFilterValues = (value) => {
  if (!value || value === "all") return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => String(item ?? "").trim())
    .filter((item) => item && item.toLowerCase() !== "all");
};

/**
 * Returns { dateLine, filterLines } describing a page's currently applied
 * filters in plain English, e.g. filterLines: ["Bank: Axis Bank"],
 * dateLine: "01 Jul 2026 - 17 Aug 2026".
 */
export const describeExportFilters = (source, filters = {}) => {
  const labels = FILTER_LABELS_BY_SOURCE[source] || {};
  const filterLines = [];

  Object.entries(labels).forEach(([key, label]) => {
    const values = activeFilterValues(filters[key]);
    if (values.length) {
      filterLines.push(`${label}: ${values.join(", ")}`);
    }
  });

  let dateLine = null;

  if (source === "transactions") {
    const { minAmount, maxAmount } = filters;
    if ((minAmount ?? "") !== "" || (maxAmount ?? "") !== "") {
      const low = (minAmount ?? "") !== "" ? minAmount : "0";
      const high = (maxAmount ?? "") !== "" ? maxAmount : "no limit";
      filterLines.push(`Amount: ${low} - ${high}`);
    }

    if (filters.tab && filters.tab !== "transactions") {
      filterLines.push(`Tab: ${filters.tab.replace(/-/g, " ")}`);
    }

    const { startDate, endDate } = filters.dateRange || {};
    if (startDate || endDate) {
      dateLine = `${formatDateOrFallback(startDate, "any")} - ${formatDateOrFallback(endDate, "any")}`;
    }
  } else if (source === "audit-log") {
    if (filters.start_date || filters.end_date) {
      dateLine = `${formatDateOrFallback(filters.start_date, "any")} - ${formatDateOrFallback(filters.end_date, "any")}`;
    }
  } else if (source === "accounts") {
    if (filters.date) {
      dateLine = formatDate(filters.date);
    }
  }

  return { dateLine, filterLines };
};
