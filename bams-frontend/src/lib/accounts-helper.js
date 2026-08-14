import { formatAmount } from "./helper";

export const ACCOUNT_RECONCILIATION_TOLERANCE = 100;
export const ACCOUNT_STALE_FEED_DAYS = 30;

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

export const getAccountSummaryCards = (
  accounts = [],
  {
    asOfDate,
    tolerance = ACCOUNT_RECONCILIATION_TOLERANCE,
    staleDays = ACCOUNT_STALE_FEED_DAYS,
  } = {},
) => {
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const bankCount = new Set(
    safeAccounts
      .map((account) => String(account?.bank_name || "").trim().toLowerCase())
      .filter(Boolean),
  ).size;

  const consolidatedBalance = safeAccounts.reduce(
    (total, account) => total + toNumber(account?.statement_balance),
    0,
  );

  const reconciledCount = safeAccounts.filter(
    (account) => Math.abs(toNumber(account?.delta)) <= tolerance,
  ).length;

  const needsReviewCount = safeAccounts.filter(
    (account) => Math.abs(toNumber(account?.delta)) > tolerance,
  ).length;

  const staleFeedCount = safeAccounts.filter(
    (account) => isStaleFeed(account, asOfDate, staleDays),
  ).length;

  return [
    {
      title: "Total accounts",
      value: safeAccounts.length,
      color: "purple",
      description: `across ${bankCount} ${bankCount === 1 ? "bank" : "banks"}`,
    },
    {
      title: "Consolidated balance",
      value: formatCompactINR(consolidatedBalance),
      color: "green",
      description: "as per statements",
    },
    {
      title: "Reconciled",
      value: reconciledCount,
      color: "green",
      indicatorColor: "green",
      description: `delta within ₹${formatAmount(tolerance)}`,
    },
    {
      title: "Needs review",
      value: needsReviewCount,
      color: "orange",
      indicatorColor: "orange",
      description: "delta above tolerance",
    },
    {
      title: "Stale feed",
      value: staleFeedCount,
      color: "red",
      indicatorColor: "red",
      description: `no alert in ${staleDays}+ days`,
    },
  ];
};
