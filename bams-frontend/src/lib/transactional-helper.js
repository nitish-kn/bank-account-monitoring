import { formatAmount, formatCompactINR } from "./helper";

const transactionTypes = [
  { name: "Credit", value: "credit" },
  { name: "Debit", value: "debit" },
];


const normalizeTransactionType = (type = "") =>
  String(type).trim().toLowerCase();


// Change numbers to finite numbers, else return 0
const toAmount = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
};


// Text strings are lowercased and stripped of whitespace
const normalizeValue = (value = "") => String(value || "").trim();
const normalizeSearchValue = (value = "") => normalizeValue(value).toLowerCase();
const compactSearchValue = (value = "") =>
  normalizeSearchValue(value).replace(/[^a-z0-9]/g, "");

const ALL_FILTER_VALUE = "all";
const MODE_CHART_COLORS = [
  "#4f86f7",
  "#2f6fe4",
  "#22a6c7",
  "#f59e0b",
  "#1d9a57",
  "#6d4ee8",
  "#a3aab8",
];

const parseToISODate = (dateStr) => {
  if (!dateStr) return "";
  const normalized = String(dateStr).trim();

  const dmyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/;
  const match = normalized.match(dmyRegex);
  if (match) {
    const [_, day, month, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const ymdRegex = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;
  const ymdMatch = normalized.match(ymdRegex);
  if (ymdMatch) {
    const [_, year, month, day] = ymdMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  try {
    const date = new Date(normalized);
    if (!isNaN(date.getTime())) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  } catch (e) { }

  return normalized.slice(0, 10);
};

const toDateOnlyValue = (dateValue) => {
  if (!dateValue) return "";

  const date =
    dateValue instanceof Date ? dateValue : new Date(parseToISODate(dateValue));
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatDateOnlyLabel = (dateValue, short = false) => {
  if (!dateValue) return "-";

  const normalized = parseToISODate(dateValue);
  const [year, month, day] = normalized.split("-").map(Number);
  const date =
    year && month && day
      ? new Date(year, month - 1, day)
      : new Date(normalized);

  if (Number.isNaN(date.getTime())) return "-";

  const options = {
    day: "2-digit",
    month: "short",
  };

  if (!short) {
    options.year = "numeric";
  }

  return date.toLocaleDateString("en-IN", options);
};

export const getDefaultTransactionDateRange = (
  baseDate = new Date(),
  daysBack = 7,
) => {
  const endDate =
    baseDate instanceof Date ? new Date(baseDate) : new Date(baseDate);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - daysBack);

  return {
    startDate: toDateOnlyValue(startDate),
    endDate: toDateOnlyValue(endDate),
  };
};

export const formatTransactionDateRangeLabel = (dateRange = {}) => {
  return {
    long: `${formatDateOnlyLabel(dateRange.startDate)} - ${formatDateOnlyLabel(dateRange.endDate)}`,
    short: `${formatDateOnlyLabel(dateRange.startDate, true)} - ${formatDateOnlyLabel(dateRange.endDate, true)}`,
  };
};

export const DEFAULT_TRANSACTION_FILTERS = {
  search: "",
  entity: ALL_FILTER_VALUE,
  bank: ALL_FILTER_VALUE,
  account: ALL_FILTER_VALUE,
  txnType: ALL_FILTER_VALUE,
  mode: ALL_FILTER_VALUE,
  category: ALL_FILTER_VALUE,
  status: ALL_FILTER_VALUE,
  minAmount: "",
  maxAmount: "",
  currency: ALL_FILTER_VALUE,
  accountHolderName: ALL_FILTER_VALUE,
  accountType: ALL_FILTER_VALUE,
  individualAccount: ALL_FILTER_VALUE,
};

const getNestedValue = (obj, path) => {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((acc, part) => acc?.[part], obj);
};

const toSelectOptions = (records = [], key, allLabel) => {
  const values = Array.from(
    new Set(
      records
        .map((record) => {
          const val = key.includes(".")
            ? getNestedValue(record, key)
            : record?.[key];
          return normalizeValue(val);
        })
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return [
    { label: allLabel, value: ALL_FILTER_VALUE },
    ...values.map((value) => ({ label: value, value })),
  ];
};


// Function to build select options using only predefined list 
const buildSelectOptions = (
  predefinedList = [],
  allLabel
) => {
  return [
    { label: allLabel, value: ALL_FILTER_VALUE },
    ...predefinedList
      .map((item) => {
        const label = item.name || item.label || String(item.value || "");
        const value = String(item.value ?? "").trim();

        return value ? { label, value } : null;
      })
      .filter(Boolean),
  ];
};

const backendValuesToOptions = (values = [], allLabel) => buildSelectOptions(
  values.map((value) => ({ name: value, value: String(value).toLowerCase() })),
  allLabel,
);


const orderedBackendOptions = (values = [], allLabel) => buildSelectOptions(
  (values || []).map((value) => ({ name: value, value: normalizeValue(value) })),
  allLabel,
);

// ---------------------- Main function to generate filter options to show in the dropdowns ----------------------
export const getTransactionFilterOptions = (records = []) => ({
  entities: toSelectOptions(
    records,
    "email_metadata.forwarded_by_name",
    "All Entities",
  ),
  banks: buildSelectOptions([], "All Banks"),
  accounts: buildSelectOptions([], "All Accounts"),
  transactionTypes: buildSelectOptions(transactionTypes, "All Types"),
  modes: toSelectOptions(records, "mode", "All Modes"),
  categories: toSelectOptions(records, "category", "All Categories"),
  statuses: toSelectOptions(
    records,
    "parser_metadata.parsed_status",
    "All Statuses",
  ),
  currencies: toSelectOptions(records, "currency", "All Currencies"),
  accountHolderNames: buildSelectOptions([], "All Account Holders"),
  accountTypes: buildSelectOptions([], "All Account Types"),
  individualAccounts: buildSelectOptions([], "All Individual Accounts"),
});

export const getAccountFilterOptions = () => ({
  banks: buildSelectOptions([], "All Banks"),
  accounts: buildSelectOptions([], "All Accounts"),
  categories: buildSelectOptions([], "All Categories"),
  individualAccounts: buildSelectOptions([], "All Individual Accounts"),
  accountHolderNames: buildSelectOptions([], "All Account Holders"),
  accountTypes: buildSelectOptions([], "All Account Types"),
});


// ---------------------- Filtering Logic ----------------------
const getActiveFilterValues = (filterValue) => {
  const rawValues = Array.isArray(filterValue) ? filterValue : [filterValue];

  return rawValues
    .map(normalizeValue)
    .filter((value) => value && value !== ALL_FILTER_VALUE);
};

const getFilterMatchTerms = (value, filterKind) => {
  const normalizedValue = normalizeSearchValue(value);
  if (!normalizedValue) return [];

  const terms = [normalizedValue];
  const compactValue = compactSearchValue(normalizedValue);

  if (filterKind === "bank") {
    const bankKey = normalizedValue
      .replace(/\bbank\b/g, "")
      .replace(/\blimited\b/g, "")
      .replace(/\bltd\b/g, "")
      .trim();
    if (bankKey) terms.push(bankKey);

    ["axis", "icici", "hdfc", "indusind", "kotak"].forEach((bankTerm) => {
      if (compactValue.includes(bankTerm)) terms.push(bankTerm);
    });
  }

  if (filterKind === "account") {
    const digits = normalizedValue.replace(/\D/g, "");
    if (digits.length >= 4) terms.push(digits.slice(-4));
    if (compactValue) terms.push(compactValue);
  }

  if (filterKind === "accountType") {
    [" account", " a/c"].forEach((suffix) => {
      if (normalizedValue.endsWith(suffix)) {
        terms.push(normalizedValue.slice(0, -suffix.length).trim());
      }
    });
  }

  return Array.from(new Set(terms.filter(Boolean)));
};


// Filter matching functions to check if a record matches the active filter values for a given field
// Function compares one record against one filter.
const matchesSelectFilter = (recordValue, filterValue, filterKind, exact = false) => {
  const activeValues = getActiveFilterValues(filterValue);
  if (!activeValues.length) return true;

  const normalizedRecordValue = normalizeSearchValue(recordValue);
  const compactRecordValue = compactSearchValue(recordValue);
  if (!normalizedRecordValue) return false;

  return activeValues.some((activeValue) => {
    if (exact) return normalizedRecordValue === normalizeSearchValue(activeValue);

    const matchTerms = getFilterMatchTerms(activeValue, filterKind);
    return matchTerms.some((term) => {
      const compactTerm = compactSearchValue(term);
      return (
        normalizedRecordValue.includes(term) ||
        term.includes(normalizedRecordValue) ||
        (compactTerm &&
          (compactRecordValue.includes(compactTerm) ||
            compactTerm.includes(compactRecordValue)))
      );
    });
  });
};

const matchesIndividualAccountFilter = (record, filterValue) => {
  const activeValues = getActiveFilterValues(filterValue);
  if (!activeValues.length) return true;

  return activeValues.some((activeVal) => {
    const parts = activeVal.split(" - ").map((p) => p.trim());
    if (parts.length < 3) return false;

    const [expectedHolder, expectedBank, expectedAccount] = parts;

    return (
      matchesSelectFilter(record?.account_holder_name, expectedHolder, undefined, true) &&
      matchesSelectFilter(record?.bank_name, expectedBank, "bank") &&
      matchesSelectFilter(record?.account_number, expectedAccount, "account")
    );
  });
};


// ---------------------- Main Filtering Function ----------------------
export const filterTransactions = (
  records = [],
  filters = DEFAULT_TRANSACTION_FILTERS,
) => {
  const normalizedFilters = {
    ...DEFAULT_TRANSACTION_FILTERS,
    ...filters,
  };

  // 1. Normalize the search term for case-insensitive matching
  const searchTerm = normalizeSearchValue(normalizedFilters.search);

  // Convert min/max amount filters to numbers and check if they are valid
  const minAmount = Number(normalizedFilters.minAmount) || 0;
  const maxAmount = Number(normalizedFilters.maxAmount) || 0;
  const hasMinAmount = normalizedFilters.minAmount !== "" && Number.isFinite(minAmount);
  const hasMaxAmount = normalizedFilters.maxAmount !== "" && Number.isFinite(maxAmount);

  // Collect all active select-type filter checks
  // Each entry is a function: (record) => boolean
  const selectFilterChecks = [];


  // 2. For each select-type filter, if it has active values, add a corresponding check function
  if (getActiveFilterValues(normalizedFilters.entity).length) {
    selectFilterChecks.push((record) =>
      matchesSelectFilter(
        record?.email_metadata?.forwarded_by_name,
        normalizedFilters.entity,
      ),
    );
  }
  if (getActiveFilterValues(normalizedFilters.bank).length) {
    selectFilterChecks.push((record) =>
      matchesSelectFilter(record?.bank_name, normalizedFilters.bank, "bank"),
    );
  }
  if (getActiveFilterValues(normalizedFilters.account).length) {
    selectFilterChecks.push((record) =>
      matchesSelectFilter(record?.account_number, normalizedFilters.account, "account"),
    );
  }
  if (getActiveFilterValues(normalizedFilters.txnType).length) {
    selectFilterChecks.push((record) =>
      matchesSelectFilter(record?.txn_type, normalizedFilters.txnType),
    );
  }
  if (getActiveFilterValues(normalizedFilters.mode).length) {
    selectFilterChecks.push((record) =>
      matchesSelectFilter(record?.mode, normalizedFilters.mode),
    );
  }
  if (getActiveFilterValues(normalizedFilters.category).length) {
    selectFilterChecks.push((record) =>
      matchesSelectFilter(record?.category, normalizedFilters.category),
    );
  }
  if (getActiveFilterValues(normalizedFilters.status).length) {
    selectFilterChecks.push((record) =>
      matchesSelectFilter(
        record?.parser_metadata?.parsed_status,
        normalizedFilters.status,
      ),
    );
  }
  if (getActiveFilterValues(normalizedFilters.currency).length) {
    selectFilterChecks.push((record) =>
      matchesSelectFilter(record?.currency, normalizedFilters.currency),
    );
  }
  if (getActiveFilterValues(normalizedFilters.accountHolderName).length) {
    selectFilterChecks.push((record) =>
      matchesSelectFilter(
        record?.account_holder_name,
        normalizedFilters.accountHolderName,
        undefined,
        true,
      ),
    );
  }
  if (getActiveFilterValues(normalizedFilters.accountType).length) {
    selectFilterChecks.push((record) =>
      matchesSelectFilter(record?.account_type, normalizedFilters.accountType, "accountType"),
    );
  }
  if (getActiveFilterValues(normalizedFilters.individualAccount).length) {
    selectFilterChecks.push((record) =>
      matchesIndividualAccountFilter(
        record,
        normalizedFilters.individualAccount,
      ),
    );
  }


  // 3. Filter the records based on the search term, amount range, and select-type filters
  return records.filter((record) => {
    const amount = toAmount(record?.amount);

    // Search is always AND — must match if present
    if (searchTerm) {
      const searchableText = [
        record?.raw_data?.subject,
        record?.email_metadata?.original_subject,
        record?.email_metadata?.receiver_subject,
        record?.ref_number,
        record?.counterparty,
        record?.narration,
        record?.category,
        record?.bank_name,
        record?.account_number,
        record?.account_holder_name,
        record?.account_type,
        record?.txn_via,
      ]
        .map(normalizeSearchValue)
        .join(" ");

      if (!searchableText.includes(searchTerm)) return false;
    }

    // Amount range is always AND — must be within range if set
    if (hasMinAmount && amount < minAmount) return false;
    if (hasMaxAmount && amount > maxAmount) return false;

    // Select filters use UNION (OR) logic:
    // If any select filters are active, record must match at least ONE of them
    if (selectFilterChecks.length > 0) {
      const matchesAny = selectFilterChecks.every((check) => check(record));
      if (!matchesAny) return false;
    }

    return true;
  });
};

export const filterTransactionsByDateRange = (records = [], dateRange = {}) => {
  const startDate = parseToISODate(dateRange.startDate);
  const endDate = parseToISODate(dateRange.endDate);

  if (!startDate && !endDate) return records;

  return records.filter((record) => {
    const transactionDate = parseToISODate(record?.txn_date);

    if (!transactionDate) return false;
    if (startDate && transactionDate < startDate) return false;
    if (endDate && transactionDate > endDate) return false;

    return true;
  });
};

export const hasActiveTransactionFilters = (
  filters = DEFAULT_TRANSACTION_FILTERS,
) => {
  const normalizedFilters = {
    ...DEFAULT_TRANSACTION_FILTERS,
    ...filters,
  };

  return Object.entries(DEFAULT_TRANSACTION_FILTERS).some(
    ([key, defaultValue]) => {
      const currentValue = normalizedFilters[key];

      if (defaultValue === ALL_FILTER_VALUE || Array.isArray(currentValue)) {
        return getActiveFilterValues(currentValue).length > 0;
      }

      return normalizeValue(currentValue) !== normalizeValue(defaultValue);
    },
  );
};

export const formatINR = (amount) => `\u20b9${formatAmount(amount)}`;

export const calculateTransactionSummary = (records = []) => {
  const summary = records.reduce(
    (acc, txn) => {
      const amount = toAmount(txn.amount);

      acc.totalTransactions += 1;

      if (normalizeTransactionType(txn.txn_type) === "credit") {
        acc.totalCredit += amount;
        acc.creditCount += 1;
      }

      if (normalizeTransactionType(txn.txn_type) === "debit") {
        acc.totalDebit += amount;
        acc.debitCount += 1;
      }

      return acc;
    },
    {
      totalCredit: 0,
      totalDebit: 0,
      creditCount: 0,
      debitCount: 0,
      totalTransactions: 0,
    },
  );

  const netBalance = summary.totalCredit - summary.totalDebit;
  const netCashFlow =
    netBalance > 0
      ? `+${formatCompactINR(netBalance)}`
      : `-${formatCompactINR(Math.abs(netBalance))}`;
  return {
    ...summary,
    netBalance,
    netCashFlow,

    formatted: {
      totalCredit: `${formatCompactINR(summary.totalCredit)}`,
      totalDebit: `${formatCompactINR(summary.totalDebit)}`,
      netBalance: `${formatCompactINR(netBalance)}`,
      netCashFlow: netCashFlow,
    },
  };
};

export const maxCreditAmount = (records = []) => {
  return records.reduce((max, txn) => {
    if (normalizeTransactionType(txn?.txn_type) === "credit") {
      const amount = toAmount(txn?.amount);
      max = Math.max(amount, max);
    }

    return max;
  }, 0);
};

export const maxDebitAmount = (records = []) => {
  return records.reduce((max, txn) => {
    if (normalizeTransactionType(txn?.txn_type) === "debit") {
      const amount = toAmount(txn?.amount);
      max = Math.max(amount, max);
    }

    return max;
  }, 0);
};

export const totalAccounts = (records = []) => {
  const accounts = new Set();

  records.forEach((txn) => {
    accounts.add(String(txn?.bank_name || "").trim());
  });

  return accounts.size;
};

export const getTransactionTypeCountData = (records = []) => {
  const counts = records.reduce(
    (acc, txn) => {
      const type = normalizeTransactionType(txn?.txn_type);

      if (type === "credit") {
        acc.credit += 1;
      }

      if (type === "debit") {
        acc.debit += 1;
      }

      return acc;
    },
    { credit: 0, debit: 0 },
  );

  return [
    { name: "Credit", value: counts.credit, color: "#16a34a" },
    { name: "Debit", value: counts.debit, color: "#dc2626" },
  ];
};

export const getTopCategoryTotals = (
  records = [],
  txnType = "debit",
  limit = 5,
) => {
  const categoryTotals = records.reduce((acc, txn) => {
    if (normalizeTransactionType(txn?.txn_type) !== txnType) {
      return acc;
    }

    const category = String(txn?.category || "Other").trim() || "Other";
    const amount = toAmount(txn?.amount);

    acc[category] = (acc[category] || 0) + amount;
    return acc;
  }, {});

  return Object.entries(categoryTotals)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
};

const getTransactionDirectionAmount = (record) => {
  const amount = toAmount(record?.amount);
  const type = normalizeTransactionType(record?.txn_type);

  if (type === "credit") return amount;
  if (type === "debit") return -amount;

  return 0;
};

const parseDateOnly = (dateValue) => {
  if (!dateValue) return null;

  const normalized = parseToISODate(dateValue);
  const [year, month, day] = normalized.split("-").map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
};

const getDateLabel = (dateValue) => {
  const date = parseDateOnly(dateValue);
  if (!date) return dateValue || "-";

  return date.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
};

export const getDailyNetCashFlowTrend = (records = [], dateRange = {}) => {
  const netByDate = records.reduce((acc, record) => {
    const date = parseToISODate(record?.txn_date);
    if (!date) return acc;

    acc[date] = (acc[date] || 0) + getTransactionDirectionAmount(record);
    return acc;
  }, {});

  const startDate =
    parseDateOnly(dateRange.startDate) ||
    parseDateOnly(Object.keys(netByDate).sort()[0]);
  const endDate =
    parseDateOnly(dateRange.endDate) ||
    parseDateOnly(Object.keys(netByDate).sort().at(-1));

  if (!startDate || !endDate || startDate > endDate) {
    return Object.entries(netByDate)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, netAmount]) => ({
        date,
        label: getDateLabel(date),
        netAmount,
        positiveAmount: netAmount >= 0 ? netAmount : null,
        negativeAmount: netAmount < 0 ? netAmount : null,
      }));
  }

  const trend = [];
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    const date = toDateOnlyValue(cursor);
    const netAmount = netByDate[date] || 0;

    trend.push({
      date,
      label: getDateLabel(date),
      netAmount,
      positiveAmount: netAmount >= 0 ? netAmount : null,
      negativeAmount: netAmount < 0 ? netAmount : null,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return trend;
};

export const getTransactionsByModeData = (records = [], limit = 7) => {
  const modeCounts = records.reduce((acc, record) => {
    const mode = normalizeValue(record?.mode) || "Others";

    if(record?.txn_type?.toLowerCase() === "debit"){
      acc[mode] = (acc[mode] || 0) + 1;
    }

    return acc;
  }, {});

  const sortedModes = Object.entries(modeCounts)
    .map(([name, count]) => ({ name, value: count }))
    .sort((a, b) => b.value - a.value);

  const visibleModes =
    sortedModes.length > limit
      ? [
        ...sortedModes.slice(0, limit - 1),
        {
          name: "Others",
          value: sortedModes
            .slice(limit - 1)
            .reduce((sum, item) => sum + item.value, 0),
        },
      ]
      : sortedModes;

  const total = visibleModes.reduce((sum, item) => sum + item.value, 0);

  return visibleModes.map((item, index) => {
    const percent = total ? (item.value / total) * 100 : 0;

    return {
      ...item,
      count: item.value,
      percent,
      percentLabel: `${percent.toFixed(1)}%`,
      color: MODE_CHART_COLORS[index % MODE_CHART_COLORS.length],
    };
  });
};

export const getTopTransactions = (records = [], limit = 5) => {
  const filteredTxns = [...records].sort(
    (a, b) => toAmount(b.amount) - toAmount(a.amount),
  );
  return filteredTxns.slice(0, limit);
};

export const getTransactionFilterOptionsFromBackend = (backendOptions = {}) => {
  const mockRecords = [];
  const maxLen = Math.max(
    backendOptions.entities?.length || 0,
    backendOptions.modes?.length || 0,
    backendOptions.categories?.length || 0,
    backendOptions.statuses?.length || 0,
    backendOptions.currencies?.length || 0
  );

  for (let i = 0; i < maxLen; i++) {
    mockRecords.push({
      email_metadata: {
        forwarded_by_name: backendOptions.entities?.[i],
      },
      mode: backendOptions.modes?.[i],
      category: backendOptions.categories?.[i],
      parser_metadata: {
        parsed_status: backendOptions.statuses?.[i]
      },
      currency: backendOptions.currencies?.[i],
    });
  }

  const options = getTransactionFilterOptions(mockRecords);
  return {
    ...options,
    // Kept in the backend's order (the default list first, then anything
    // else stored) rather than re-sorted alphabetically.
    modes: orderedBackendOptions(backendOptions.modes, "All Modes"),
    categories: orderedBackendOptions(backendOptions.categories, "All Categories"),
    banks: backendValuesToOptions(backendOptions.banks, "All Banks"),
    accounts: backendValuesToOptions(backendOptions.accounts, "All Accounts"),
    accountHolderNames: backendValuesToOptions(backendOptions.accountHolderNames, "All Account Holders"),
    individualAccounts: backendValuesToOptions(backendOptions.individualAccounts, "All Individual Accounts"),
    accountTypes: backendValuesToOptions(backendOptions.accountTypes, "All Account Types"),
  };
};

export const getAccountFilterOptionsFromBackend = (backendOptions = {}) => ({
  ...getAccountFilterOptions(),
  banks: backendValuesToOptions(backendOptions.banks, "All Banks"),
  accounts: backendValuesToOptions(backendOptions.accounts, "All Accounts"),
  accountHolderNames: backendValuesToOptions(backendOptions.accountHolderNames, "All Account Holders"),
  individualAccounts: backendValuesToOptions(backendOptions.individualAccounts, "All Individual Accounts"),
  accountTypes: backendValuesToOptions(backendOptions.accountTypes, "All Account Types"),
  categories: backendValuesToOptions(backendOptions.accountCategories, "All Categories"),
});
