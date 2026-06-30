import { formatAmount, formatCompactINR } from "./helper";

const all_banks = [
  { name: "Axis Bank", value: "axis bank" },
  { name: "ICICI Bank", value: "icici bank" },
  { name: "HDFC Bank", value: "hdfc bank" },
];

const all_account_holder_names_ = [
  { name: "R N Gupta", value: "r n gupta" },
  { name: "R N Gupta H", value: "r n gupta h" },
  { name: "Bhagwati Devi", value: "bhagwati devi" },
  { name: "Om Prakash Gupta", value: "om prakash gupta" },
  { name: "OM Prakash Gupta HUF", value: "om prakash gupta huf" },
  { name: "Sunita Gupta", value: "sunita gupta" },
  { name: "Ujjwal Gupta", value: "ujjwal gupta" },
  { name: "Ujjwal Gupta HUF", value: "ujjwal gupta huf" },
  { name: "Arvind Kumar Gupta", value: "arvind kumar gupta" },
  { name: "Arvind Kumar Gupta H", value: "arvind kumar gupta h" },
  { name: "Deepali Gupta", value: "deepali gupta" },
  { name: "Samriddhi Gupta", value: "samriddhi gupta" },
  { name: "Umang Gupta", value: "umang gupta" },
  { name: "Umang Gupta NRE A/c", value: "umang gupta nre a/c" },
  { name: "Vaibhav Gupta", value: "vaibhav gupta" },
  { name: "Ram Niwas Gupta", value: "ram niwas gupta" },
  { name: "Ram Niwas Gupta HUF", value: "ram niwas gupta huf" },
  { name: "Om Prakash Gupta HUF", value: "om prakash gupta huf" },
  { name: "Arvind Kumar Gupta HUF", value: "arvind kumar gupta huf" },
  { name: "Umang Gupta NRO", value: "umang gupta nro" },
  { name: "Umang Gupta NRE", value: "umang gupta nre" },
  { name: "Arvind Gupta", value: "arvind gupta" },
  { name: "Arivind Gupta HUF", value: "arivind gupta huf" },
  { name: "Arvind Gupta Oorja/UG", value: "arvind gupta oorja/ug" },
];

const all_account_types = [
  { name: "SBPRV", value: "sbprv" },
  { name: "SBSPA", value: "sbspa" },
  { name: "SBEZY", value: "sbezy" },
  { name: "SBSPL", value: "sbspl" },
  { name: "NRE", value: "nre" },
  { name: "SAAQB25K", value: "saaqb25k" },
  { name: "Savings Account", value: "savings account" },
  { name: "Fixed Deposit", value: "fixed deposit" },
  { name: "Current Account", value: "current account" },
];

const all_account_numbers = [
  // From First Image
  { name: "XX5662", value: "xx5662" },
  { name: "XX7775", value: "xx7775" },
  { name: "XX5671", value: "xx5671" },
  { name: "XX7393", value: "xx7393" },
  { name: "XX1834", value: "xx1834" },
  { name: "XX6193", value: "xx6193" },
  { name: "XX2006", value: "xx2006" },
  { name: "XX5532", value: "xx5532" },
  { name: "XX7989", value: "xx7989" },
  { name: "XX6744", value: "xx6744" },
  { name: "XX5644", value: "xx5644" },
  { name: "XX1450", value: "xx1450" },
  { name: "XX1618", value: "xx1618" },
  { name: "XX7701", value: "xx7701" },
  { name: "XX2994", value: "xx2994" },
  { name: "XX4782", value: "xx4782" },
  { name: "XX9814", value: "xx9814" },
  { name: "XX4789", value: "xx4789" },
  { name: "XX4784", value: "xx4784" },
  { name: "XX9811", value: "xx9811" },
  { name: "XX4787", value: "xx4787" },
  { name: "XX4783", value: "xx4783" },
  { name: "XX9810", value: "xx9810" },
  { name: "XX4785", value: "xx4785" },
  { name: "XX9812", value: "xx9812" },
  { name: "XX4786", value: "xx4786" },
  { name: "XX4788", value: "xx4788" },
  { name: "XX7163", value: "xx7163" },
  { name: "XX9775", value: "xx9775" },
  { name: "XX3815", value: "xx3815" },
  { name: "XX0290", value: "xx0290" },
  { name: "XX5763", value: "xx5763" },
  { name: "XX8525", value: "xx8525" },
  { name: "XX8673", value: "xx8673" },
  { name: "XX2021", value: "xx2021" },
  { name: "XX7141", value: "xx7141" },
  { name: "XX4845", value: "xx4845" },
];

const individual_account = [
  // --- Axis Bank Section ---
  { name: "R N Gupta - Axis Bank - XX5662", value: "r n gupta - axis bank - xx5662" },
  { name: "R N Gupta H - Axis Bank - XX7775", value: "r n gupta h - axis bank - xx7775" },
  { name: "Bhagwati Devi - Axis Bank - XX5671", value: "bhagwati devi - axis bank - xx5671" },
  { name: "Om Prakash Gupta - Axis Bank - XX7393", value: "om prakash gupta - axis bank - xx7393" },
  { name: "OM Prakash Gupta HUF - Axis Bank - XX1834", value: "om prakash gupta huf - axis bank - xx1834" },
  { name: "Sunita Gupta - Axis Bank - XX6193", value: "sunita gupta - axis bank - xx6193" },
  { name: "Ujjwal Gupta - Axis Bank - XX2006", value: "ujjwal gupta - axis bank - xx2006" },
  { name: "Ujjwal Gupta HUF - Axis Bank - XX5532", value: "ujjwal gupta huf - axis bank - xx5532" },
  { name: "Arvind Kumar Gupta - Axis Bank - XX7989", value: "arvind kumar gupta - axis bank - xx7989" },
  { name: "Arvind Kumar Gupta H - Axis Bank - XX6744", value: "arvind kumar gupta h - axis bank - xx6744" },
  { name: "Deepali Gupta - Axis Bank - XX5644", value: "deepali gupta - axis bank - xx5644" },
  { name: "Samriddhi Gupta - Axis Bank - XX1450", value: "samriddhi gupta - axis bank - xx1450" },
  { name: "Umang Gupta - Axis Bank - XX1618", value: "umang gupta - axis bank - xx1618" },
  { name: "Umang Gupta NRE A/c - Axis Bank - XX7701", value: "umang gupta nre a/c - axis bank - xx7701" },
  { name: "Vaibhav Gupta - Axis Bank - XX2994", value: "vaibhav gupta - axis bank - xx2994" },

  // --- ICICI Bank Section ---
  { name: "Ram Niwas Gupta - ICICI Bank - XX4782", value: "ram niwas gupta - icici bank - xx4782" },
  { name: "Ram Niwas Gupta HUF - ICICI Bank - XX9814", value: "ram niwas gupta huf - icici bank - xx9814" },
  { name: "Bhagwati Devi - ICICI Bank - XX4789", value: "bhagwati devi - icici bank - xx4789" },
  { name: "Om Prakash Gupta - ICICI Bank - XX4784", value: "om prakash gupta - icici bank - xx4784" },
  { name: "Om Prakash Gupta HUF - ICICI Bank - XX9811", value: "om prakash gupta huf - icici bank - xx9811" },
  { name: "Sunita Gupta - ICICI Bank - XX4787", value: "sunita gupta - icici bank - xx4787" },
  { name: "Ujjwal Gupta - ICICI Bank - XX4783", value: "ujjwal gupta - icici bank - xx4783" },
  { name: "Ujjwal Gupta HUF - ICICI Bank - XX9810", value: "ujjwal gupta huf - icici bank - xx9810" },
  { name: "Arvind Kumar Gupta - ICICI Bank - XX4785", value: "arvind kumar gupta - icici bank - xx4785" },
  { name: "Arvind Kumar Gupta HUF - ICICI Bank - XX9812", value: "arvind kumar gupta huf - icici bank - xx9812" },
  { name: "Deepali Gupta - ICICI Bank - XX4786", value: "deepali gupta - icici bank - xx4786" },
  { name: "Vaibhav Gupta - ICICI Bank - XX4788", value: "vaibhav gupta - icici bank - xx4788" },
  { name: "Umang Gupta NRO - ICICI Bank - XX7163", value: "umang gupta nro - icici bank - xx7163" },
  { name: "Umang Gupta NRE - ICICI Bank - XX9775", value: "umang gupta nre - icici bank - xx9775" },

  // --- HDFC Bank Section ---
  { name: "Deepali Gupta - HDFC Bank - XX3815", value: "deepali gupta - hdfc bank - xx3815" },
  { name: "Vaibhav Gupta - HDFC Bank - XX0290", value: "vaibhav gupta - hdfc bank - xx0290" },
  { name: "Arvind Gupta - HDFC Bank - XX5763", value: "arvind gupta - hdfc bank - xx5763" },
  { name: "Arivind Gupta HUF - HDFC Bank - XX8525", value: "arivind gupta huf - hdfc bank - xx8525" },
  { name: "Arvind Gupta Oorja/UG - HDFC Bank - XX8673", value: "arvind gupta oorja/ug - hdfc bank - xx8673" },
  { name: "Ujjwal Gupta - HDFC Bank - XX2021", value: "ujjwal gupta - hdfc bank - xx2021" },
  { name: "Om Prakash Gupta - HDFC Bank - XX7141", value: "om prakash gupta - hdfc bank - xx7141" },
  { name: "Sunita Gupta - HDFC Bank - XX4845", value: "sunita gupta - hdfc bank - xx4845" }
];


const normalizeTransactionType = (type = "") =>
  String(type).trim().toLowerCase();

const toAmount = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
};

const normalizeValue = (value = "") => String(value || "").trim();
const normalizeSearchValue = (value = "") =>
  normalizeValue(value).toLowerCase();

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

const buildCombinedSelectOptions = (records = [], key, predefinedList = [], allLabel) => {
  const optionsMap = new Map();

  predefinedList.forEach((item) => {
    const label = item.name || item.label || String(item.value || "");
    const val = String(item.value ?? "").trim();
    if (val) {
      optionsMap.set(val.toLowerCase(), { label, value: val });
    }
  });

  records.forEach((record) => {
    const rawVal = key.includes(".")
      ? getNestedValue(record, key)
      : record?.[key];
    const val = normalizeValue(rawVal);
    if (val) {
      const lowerVal = val.toLowerCase();
      if (!optionsMap.has(lowerVal)) {
        optionsMap.set(lowerVal, { label: val, value: val });
      }
    }
  });

  const predefinedKeysOrder = predefinedList
    .map((item) => String(item.value ?? "").trim().toLowerCase())
    .filter(Boolean);

  const predefinedOptionsOrdered = [];
  const dynamicOptions = [];

  optionsMap.forEach((opt, lowerVal) => {
    if (predefinedKeysOrder.includes(lowerVal)) {
      predefinedOptionsOrdered.push({
        index: predefinedKeysOrder.indexOf(lowerVal),
        option: opt,
      });
    } else {
      dynamicOptions.push(opt);
    }
  });

  predefinedOptionsOrdered.sort((a, b) => a.index - b.index);
  const orderedPredefinedList = predefinedOptionsOrdered.map((o) => o.option);

  dynamicOptions.sort((a, b) => a.label.localeCompare(b.label));

  return [
    { label: allLabel, value: ALL_FILTER_VALUE },
    ...orderedPredefinedList,
    ...dynamicOptions,
  ];
};

const buildIndividualAccountOptions = (records = [], predefinedList = [], allLabel) => {
  const optionsMap = new Map();

  predefinedList.forEach((item) => {
    const label = item.name || item.label || String(item.value || "");
    const val = String(item.value ?? "").trim();
    if (val) {
      optionsMap.set(val.toLowerCase(), { label, value: val });
    }
  });

  records.forEach((record) => {
    const holder = normalizeValue(record?.account_holder_name);
    const bank = normalizeValue(record?.bank_name);
    const account = normalizeValue(record?.account_number);

    if (holder && bank && account) {
      const name = `${holder} - ${bank} - ${account}`;
      const val = name.toLowerCase();
      if (!optionsMap.has(val)) {
        optionsMap.set(val, { label: name, value: val });
      }
    }
  });

  const predefinedKeysOrder = predefinedList
    .map((item) => String(item.value ?? "").trim().toLowerCase())
    .filter(Boolean);

  const predefinedOptionsOrdered = [];
  const dynamicOptions = [];

  optionsMap.forEach((opt, lowerVal) => {
    if (predefinedKeysOrder.includes(lowerVal)) {
      predefinedOptionsOrdered.push({
        index: predefinedKeysOrder.indexOf(lowerVal),
        option: opt,
      });
    } else {
      dynamicOptions.push(opt);
    }
  });

  predefinedOptionsOrdered.sort((a, b) => a.index - b.index);
  const orderedPredefinedList = predefinedOptionsOrdered.map((o) => o.option);

  dynamicOptions.sort((a, b) => a.label.localeCompare(b.label));

  return [
    { label: allLabel, value: ALL_FILTER_VALUE },
    ...orderedPredefinedList,
    ...dynamicOptions,
  ];
};

export const getTransactionFilterOptions = (records = []) => ({
  entities: toSelectOptions(
    records,
    "email_metadata.forwarded_by_name",
    "All Entities",
  ),
  banks: buildCombinedSelectOptions(records, "bank_name", all_banks, "All Banks"),
  accounts: buildCombinedSelectOptions(records, "account_number", all_account_numbers, "All Accounts"),
  transactionTypes: toSelectOptions(records, "txn_type", "All Types"),
  modes: toSelectOptions(records, "mode", "All Modes"),
  categories: toSelectOptions(records, "category", "All Categories"),
  statuses: toSelectOptions(
    records,
    "parser_metadata.parsed_status",
    "All Statuses",
  ),
  currencies: toSelectOptions(records, "currency", "All Currencies"),
  accountHolderNames: buildCombinedSelectOptions(
    records,
    "account_holder_name",
    all_account_holder_names_,
    "All Account Holders",
  ),
  accountTypes: buildCombinedSelectOptions(
    records,
    "account_type",
    all_account_types,
    "All Account Types",
  ),
  individualAccounts: buildIndividualAccountOptions(
    records,
    individual_account,
    "All Individual Accounts",
  ),
});

const getActiveFilterValues = (filterValue) => {
  const rawValues = Array.isArray(filterValue) ? filterValue : [filterValue];

  return rawValues
    .map(normalizeValue)
    .filter((value) => value && value !== ALL_FILTER_VALUE);
};

const matchesSelectFilter = (recordValue, filterValue) => {
  const activeValues = getActiveFilterValues(filterValue);
  if (!activeValues.length) return true;

  const normalizedRecordValue = normalizeSearchValue(recordValue);
  if (!normalizedRecordValue) return false;

  return activeValues.some(
    (activeValue) => {
      const normalizedActiveValue = normalizeSearchValue(activeValue);
      if (!normalizedActiveValue) return false;
      return (
        normalizedRecordValue.includes(normalizedActiveValue) ||
        normalizedActiveValue.includes(normalizedRecordValue)
      );
    }
  );
};

const matchesIndividualAccountFilter = (record, filterValue) => {
  const activeValues = getActiveFilterValues(filterValue);
  if (!activeValues.length) return true;

  return activeValues.some((activeVal) => {
    const parts = activeVal.split(" - ").map((p) => p.trim());
    if (parts.length < 3) return false;

    const [expectedHolder, expectedBank, expectedAccount] = parts;

    return (
      matchesSelectFilter(record?.account_holder_name, expectedHolder) &&
      matchesSelectFilter(record?.bank_name, expectedBank) &&
      matchesSelectFilter(record?.account_number, expectedAccount)
    );
  });
};

export const filterTransactions = (
  records = [],
  filters = DEFAULT_TRANSACTION_FILTERS,
) => {
  const normalizedFilters = {
    ...DEFAULT_TRANSACTION_FILTERS,
    ...filters,
  };

  const searchTerm = normalizeSearchValue(normalizedFilters.search);
  const minAmount = Number(normalizedFilters.minAmount);
  const maxAmount = Number(normalizedFilters.maxAmount);
  const hasMinAmount =
    normalizedFilters.minAmount !== "" && Number.isFinite(minAmount);
  const hasMaxAmount =
    normalizedFilters.maxAmount !== "" && Number.isFinite(maxAmount);

  // Collect all active select-type filter checks
  // Each entry is a function: (record) => boolean
  const selectFilterChecks = [];

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
      matchesSelectFilter(record?.bank_name, normalizedFilters.bank),
    );
  }
  if (getActiveFilterValues(normalizedFilters.account).length) {
    selectFilterChecks.push((record) =>
      matchesSelectFilter(record?.account_number, normalizedFilters.account),
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
      ),
    );
  }
  if (getActiveFilterValues(normalizedFilters.accountType).length) {
    selectFilterChecks.push((record) =>
      matchesSelectFilter(record?.account_type, normalizedFilters.accountType),
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
        record?.vpa,
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
      const matchesAny = selectFilterChecks.some((check) => check(record));
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
