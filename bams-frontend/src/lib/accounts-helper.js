import { formatAmount } from "./helper";

export const ACCOUNT_RECONCILIATION_TOLERANCE = 100;
export const ACCOUNT_STALE_FEED_DAYS = 30;

/** Last 4 digits of the account number, e.g. "XX2006" -- how the transaction
 * filters identify one account without needing its full number. */
export const getAccountNumberFilterLabel = (accountNumber) => {
  const rawAccountNumber = String(accountNumber || "").trim();
  const digits = rawAccountNumber.replace(/\D/g, "");

  if (digits.length >= 4) return `XX${digits.slice(-4)}`;
  return rawAccountNumber;
};

/** The "holder - bank - XX1234" string the /transactions/query
 * `individualAccount` filter matches a single account by. */
export const getIndividualAccountFilterValue = (account) => {
  const accountParts = [
    account?.account_holder_name,
    account?.bank_name,
    getAccountNumberFilterLabel(account?.account_number),
  ].filter(Boolean);

  return accountParts.join(" - ").toLowerCase();
};

const toNumber = (value) => {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const toDate = (value) => {
  if (!value) return null;
  const parsedDate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const formatCompactINR = (value) => {
  const numberValue = toNumber(value);
  const absValue = Math.abs(numberValue);
  const sign = numberValue < 0 ? "-" : "";

  if (absValue >= 10000000) {
    return `${sign}₹${(absValue / 10000000).toFixed(2).replace(/\.00$/, "")} Cr`;
  }
  if (absValue >= 100000) {
    return `${sign}₹${(absValue / 100000).toFixed(2).replace(/\.00$/, "")} L`;
  }
  if (absValue >= 1000) {
    return `${sign}₹${(absValue / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  }

  return `${sign}₹${formatAmount(absValue)}`;
};

export const getAccountBalanceTotals = (accounts = []) => {
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const statementBalance = safeAccounts.reduce(
    (total, account) => total + toNumber(account?.statement_balance),
    0,
  );
  const calculatedBalance = safeAccounts.reduce(
    (total, account) => total + toNumber(account?.calculated_balance ?? account?.current_balance),
    0,
  );

  return {
    statementBalance,
    calculatedBalance,
    statementBalanceLabel: `Total ₹${formatAmount(statementBalance)}`,
    calculatedBalanceLabel: `Total ₹${formatAmount(calculatedBalance)}`,
  };
};

const getLastCalculatedAt = (account) => (
  account?.last_calculated_at
  || account?.calculated_updated_at
  || account?.last_updated
);

const isStaleFeed = (account, asOfDate, staleDays) => {
  const lastCalculatedAt = toDate(getLastCalculatedAt(account));
  const selectedDate = toDate(asOfDate) || new Date();

  if (!lastCalculatedAt) return true;

  const elapsedMs = selectedDate.getTime() - lastCalculatedAt.getTime();
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  return elapsedDays >= staleDays;
};

// Shared with the "Reconciled" / "Needs review" summary cards -- same
// predicate backs both the count shown and the table filter a card applies,
// so they can never disagree. An account with no balance data at all (no
// current_balance AND no statement_balance -> delta is null) is neither:
// there's nothing to reconcile, so it shouldn't silently count as "ok".
export const isAccountReconciled = (account, tolerance = ACCOUNT_RECONCILIATION_TOLERANCE) =>
  account?.delta != null && Math.abs(toNumber(account.delta)) <= tolerance;

export const isAccountNeedsReview = (account, tolerance = ACCOUNT_RECONCILIATION_TOLERANCE) =>
  account?.delta != null && Math.abs(toNumber(account.delta)) > tolerance;

export const isAccountStale = (account, asOfDate, staleDays = ACCOUNT_STALE_FEED_DAYS) =>
  isStaleFeed(account, asOfDate, staleDays);

export const getAccountSummaryCards = (
  accounts = [],
  {
    asOfDate,
    tolerance = ACCOUNT_RECONCILIATION_TOLERANCE,
    staleDays = ACCOUNT_STALE_FEED_DAYS,
    configuredBankCount = null,
  } = {},
) => {
  const safeAccounts = Array.isArray(accounts) ? accounts : [];

  const consolidatedBalance = safeAccounts.reduce(
    (total, account) => total + toNumber(account?.statement_balance),
    0,
  );

  const reconciledCount = safeAccounts.filter((account) => isAccountReconciled(account, tolerance)).length;
  const needsReviewCount = safeAccounts.filter((account) => isAccountNeedsReview(account, tolerance)).length;
  const staleFeedCount = safeAccounts.filter((account) => isAccountStale(account, asOfDate, staleDays)).length;

  return [
    {
      key: "total",
      title: "Total accounts",
      value: safeAccounts.length,
      color: "purple",
      description: configuredBankCount
        ? `across ${configuredBankCount} ${configuredBankCount === 1 ? "bank" : "banks"}`
        : "",
    },
    {
      key: "balance",
      title: "Consolidated balance",
      value: formatCompactINR(consolidatedBalance),
      color: "green",
      description: "as per statements",
    },
    {
      key: "reconciled",
      title: "Reconciled",
      value: reconciledCount,
      color: "green",
      indicatorColor: "green",
      description: `delta within ₹${formatAmount(tolerance)}`,
    },
    {
      key: "needsReview",
      title: "Needs review",
      value: needsReviewCount,
      color: "orange",
      indicatorColor: "orange",
      description: "delta above tolerance",
    },
    {
      key: "stale",
      title: "Stale feed",
      value: staleFeedCount,
      color: "red",
      indicatorColor: "red",
      description: `no alert in ${staleDays}+ days`,
    },
  ];
};
