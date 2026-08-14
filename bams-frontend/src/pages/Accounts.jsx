import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Spinner, Table } from "@radix-ui/themes";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Filter, Plus, RotateCcw } from "lucide-react";

import { accountsApi } from "../api/accounts";
import CustomButton from "../components/ui/CustomButton";
import CustomDropDown from "../components/ui/CustomDropDown";
import CustomSearchBar from "../components/ui/CustomSearchBar";
import CustomTable from "../components/ui/CustomTable";
import DataCard from "../components/ui/DataCard";
import Pagination from "../components/Pagination";
import { cleanText, formatAmount, formatDate, formatDateAndTime, formatINR } from "../lib/helper";
import { getAccountBalanceTotals, getAccountSummaryCards } from "../lib/accounts-helper";
import { getAccountFilterOptions } from "../lib/transactional-helper";
import AddAcounts from "../components/AddAcounts";
import { AccountCategoryBadge, AmountColor, TypeBadge } from "../utils/Badges";

const ALL_FILTER_VALUE = "all";

const toDateValue = (date) => {
  if (!date) return "";
  const parsedDate = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return "";
  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDefaultAccountFilters = () => ({
  search: "",
  account: ALL_FILTER_VALUE,
  individualAccount: ALL_FILTER_VALUE,
  bank: ALL_FILTER_VALUE,
  category: ALL_FILTER_VALUE,
  accountType: ALL_FILTER_VALUE,
  accountHolderName: ALL_FILTER_VALUE,
  date: toDateValue(new Date()),
});

const dropdownTriggerClassName = "h-9! w-full justify-between! text-sm";
const dropdownContentClassName = "min-w-56 max-h-72 overflow-y-auto";
const ACCOUNT_CACHE_FETCH_LIMIT = 1000;
const RECENT_ACCOUNT_TXN_LIMIT = 5;
const RECENT_ACCOUNT_TXN_TABLE_WIDTH = "820px"; // min-width floor; table stretches to fill the row

const getAllOptionLabel = (options = [], fallback = "All") => (
  options?.find((option) => option?.value === ALL_FILTER_VALUE)?.label || fallback
);

const toNumber = (value) => {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const getAccountNumberFilterLabel = (accountNumber) => {
  const rawAccountNumber = String(accountNumber || "").trim();
  const digits = rawAccountNumber.replace(/\D/g, "");

  if (digits.length >= 4) return `XX${digits.slice(-4)}`;
  return rawAccountNumber;
};

const getIndividualAccountFilterValue = (account) => {
  const accountParts = [
    account?.account_holder_name,
    account?.bank_name,
    getAccountNumberFilterLabel(account?.account_number),
  ].filter(Boolean);

  return accountParts.join(" - ").toLowerCase();
};

const getLatestTransactionDateRange = (transactions = []) => {
  const latestTransactionDate = transactions.reduce((latestDate, transaction) => {
    const parsedDate = new Date(transaction?.txn_date || transaction?.created_at || "");
    if (Number.isNaN(parsedDate.getTime())) return latestDate;
    return !latestDate || parsedDate > latestDate ? parsedDate : latestDate;
  }, null);

  if (!latestTransactionDate) return null;

  const startDate = new Date(latestTransactionDate);
  startDate.setMonth(startDate.getMonth() - 1);

  return {
    startDate: toDateValue(startDate),
    endDate: toDateValue(latestTransactionDate),
  };
};

const formatCurrency = (value) => `${"\u20b9"}${formatAmount(toNumber(value))}`;

const formatCompactCurrency = (value) => {
  const numberValue = toNumber(value);
  const absValue = Math.abs(numberValue);

  if (absValue >= 10000000) return `${"\u20b9"}${(absValue / 10000000).toFixed(2).replace(/\.00$/, "")} Cr`;
  if (absValue >= 100000) return `${"\u20b9"}${(absValue / 100000).toFixed(2).replace(/\.00$/, "")} L`;
  if (absValue >= 1000) return `${"\u20b9"}${(absValue / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${"\u20b9"}${formatAmount(absValue)}`;
};

const AccountTypeBadge = ({ type }) => {
  const normalizedType = String(type || "").trim().toLowerCase();
  const colorClasses = {
    business: "bg-orange-50 text-orange-600",
    common: "bg-purple-50 text-purple-600",
    huf: "bg-teal-50 text-teal-700",
    personal: "bg-blue-50 text-blue-700",
    firm: "bg-gray-100 text-gray-700",
  };

  return (
    <span
      className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${
        colorClasses[normalizedType] || "bg-gray-100 text-gray-700"
      }`}
    >
      {type || "-"}
    </span>
  );
};

const BalanceCell = ({ amount, label, muted = false, warning }) => (
  <div className="min-w-0 text-right">
    <p className={`truncate text-sm font-bold ${muted ? "text-gray-400" : "text-gray-950"}`}>
      {amount === null || amount === undefined ? "-" : formatINR(amount)}
    </p>
    <p className={`mt-1 truncate text-xs ${warning ? "font-semibold text-orange-600" : "text-slate-400"}`}>
      {warning || label || "-"}
    </p>
  </div>
);

const DeltaBadge = ({ value }) => {
  const delta = toNumber(value);
  const isZero = Math.abs(delta) < 0.01;

  if (isZero) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-3 py-1 text-sm font-bold text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {formatINR(0)}
      </span>
    );
  }

  const isLarge = Math.abs(delta) >= 100000;
  const colorClass = isLarge
    ? "bg-red-50 text-red-600"
    : "bg-orange-50 text-orange-600";

  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-3 py-1 text-sm font-bold ${colorClass}`}>
      <AlertTriangle className="h-3.5 w-3.5" />
      {formatINR(delta)}
    </span>
  );
};

const Accounts = () => {
  const navigate = useNavigate();
  const filterOptions = useMemo(() => getAccountFilterOptions(), []);
  const [accounts, setAccounts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState({ field: "account", order: "asc" });
  const [filters, setFilters] = useState(() => getDefaultAccountFilters());
  const [draftFilters, setDraftFilters] = useState(() => getDefaultAccountFilters());
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [addAccounts, setAddAccounts] = useState(false);
  const [expandedAccountIds, setExpandedAccountIds] = useState({});
  const [recentTransactionsByAccountId, setRecentTransactionsByAccountId] = useState({});
  const [recentTransactionsLoading, setRecentTransactionsLoading] = useState({});
  const [recentTransactionsError, setRecentTransactionsError] = useState({});
  const [openFilter, setOpenFilter] = useState(false);

  const updateDraftFilter = (key, value) => {
    setDraftFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value,
    }));
  };

  const applyFilters = () => {
    setFilters(draftFilters);
    setPage(1);
  };

  const resetFilters = () => {
    const defaultFilters = getDefaultAccountFilters();
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
    setPage(1);
  };

  const handleSort = (field) => {
    setSort((currentSort) => ({
      field,
      order: currentSort.field === field && currentSort.order === "asc" ? "desc" : "asc",
    }));
    setPage(1);
  };

  const viewAllTransactionsForAccount = useCallback((account) => {
    const individualAccount = getIndividualAccountFilterValue(account);
    const transactionDateRange = getLatestTransactionDateRange(
      recentTransactionsByAccountId[account?.id] || [],
    );
    const params = new URLSearchParams();

    params.set("tab", "transactions");
    if (individualAccount) {
      params.set("individualAccount", individualAccount);
    }
    if (transactionDateRange?.startDate && transactionDateRange?.endDate) {
      params.set("startDate", transactionDateRange.startDate);
      params.set("endDate", transactionDateRange.endDate);
    }

    navigate({
      pathname: "/transactions",
      search: params.toString(),
    });
  }, [navigate, recentTransactionsByAccountId]);

  const toggleAccountTransactions = useCallback(async (account) => {
    const accountId = account?.id;
    if (!accountId) return;

    if (expandedAccountIds[accountId]) {
      setExpandedAccountIds((current) => ({ ...current, [accountId]: false }));
      return;
    }

    setExpandedAccountIds((current) => ({ ...current, [accountId]: true }));

    if (recentTransactionsByAccountId[accountId] || recentTransactionsLoading[accountId]) {
      return;
    }

    setRecentTransactionsLoading((current) => ({ ...current, [accountId]: true }));
    setRecentTransactionsError((current) => ({ ...current, [accountId]: "" }));

    try {
      const result = await accountsApi.getRecentTransactions(accountId, RECENT_ACCOUNT_TXN_LIMIT);
      setRecentTransactionsByAccountId((current) => ({
        ...current,
        [accountId]: result.transactions || [],
      }));
    } catch (err) {
      setRecentTransactionsError((current) => ({
        ...current,
        [accountId]: err.response?.data?.detail || err.message || "Failed to load recent transactions.",
      }));
    } finally {
      setRecentTransactionsLoading((current) => ({ ...current, [accountId]: false }));
    }
  }, [expandedAccountIds, recentTransactionsByAccountId, recentTransactionsLoading]);

  useEffect(() => {
    const fetchAccounts = async () => {
      const showInitialLoader = accounts.length === 0;
      setError("");
      setLoading(showInitialLoader);
      setIsRefreshing(!showInitialLoader);

      try {
        const result = await accountsApi.queryAccounts(
          filters,
          { page: 1, pageSize: ACCOUNT_CACHE_FETCH_LIMIT },
          sort,
        );

        const fetchedAccounts = result.accounts || [];
        setAccounts(fetchedAccounts);
        setTotalCount(fetchedAccounts.length);
      } catch (err) {
        setError(err.message || "Failed to load accounts");
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    };

    fetchAccounts();
  }, [filters, sort]);

  const paginatedAccounts = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return accounts.slice(startIndex, startIndex + pageSize);
  }, [accounts, page, pageSize]);

  console.log(accounts)
  const summaryCards = useMemo(
    () => getAccountSummaryCards(accounts, { asOfDate: filters.date }),
    [accounts, filters.date],
  );
  const balanceTotals = useMemo(
    () => getAccountBalanceTotals(accounts),
    [accounts],
  );

  const columns = useMemo(
    () => [
      {
        key: "account",
        header: "Account",
        sortable: true,
        sortKey: "account",
        columnWidth: "360px",
        render: (account) => (
          <div className="flex min-w-0 items-center gap-3 pl-2">
            <CustomButton
              type="button"
              color={expandedAccountIds[account.id] ? "blue" : "gray"}
              variant={expandedAccountIds[account.id] ? "solid" : "soft"}
              size="1"
              radius="medium"
              aria-label={`Show recent transactions for ${account.account_holder_name || "account"}`}
              aria-expanded={!!expandedAccountIds[account.id]}
              disabled={recentTransactionsLoading[account.id]}
              onClick={() => toggleAccountTransactions(account)}
              className="h-6! w-6! min-w-0! shrink-0! p-0! disabled:cursor-wait! disabled:opacity-70!"
            >
              {expandedAccountIds[account.id] ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </CustomButton>

            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-950" title={account.account_holder_name}>
                {account.account_holder_name || "-"}
              </p>
              <p className="mt-1 truncate text-xs font-medium text-slate-400" title={`${account.account_number || "-"} · ${account.bank_name || "-"}`}>
                {account.account_number || "-"} · {account.bank_name || "-"}
              </p>
            </div>
          </div>
        ),
      },
      {
        key: "category",
        header: "Category",
        sortable: true,
        sortKey: "category",
        columnWidth: "150px",
        render: (account) => <AccountCategoryBadge category={account?.category} />,
      },
      {
        key: "account_type",
        header: "Type",
        sortable: true,
        sortKey: "account_type",
        columnWidth: "150px",
        render: (account) => <AccountTypeBadge type={account.account_type} />,
      },
      {
        key: "bank_name",
        header: "Bank",
        sortable: true,
        sortKey: "bank",
        columnWidth: "180px",
        render: (account) => (
          <p className="truncate text-sm font-bold text-slate-950" title={account.bank_name}>
            {account.bank_name || "-"}
          </p>
        ),
      },
      {
        key: "statement_balance",
        header: "Balance - Statement",
        headerSubtext: balanceTotals.statementBalanceLabel,
        sortable: true,
        sortKey: "statement_balance",
        columnWidth: "210px",
        headerAlign: "right",
        headerClassName: "text-right",
        cellClassName: "text-right [&>div]:justify-end",
        render: (account) => (
          <BalanceCell
            amount={account.statement_balance}
            label={`${formatDate(account.statement_updated_at)}`}
          />
        ),
      },
      {
        key: "current_balance",
        header: "Balance - Calculated",
        headerSubtext: balanceTotals.calculatedBalanceLabel,
        sortable: true,
        sortKey: "current_balance",
        columnWidth: "210px",
        headerAlign: "right",
        headerClassName: "text-right",
        cellClassName: "text-right [&>div]:justify-end",
        render: (account) => (
          <BalanceCell
            amount={account.calculated_balance}
            label={`${formatDate(account.calculated_updated_at)}`}
            muted={Math.abs(toNumber(account.delta)) < 0.01}
          />
        ),
      },
      {
        key: "delta",
        header: "Delta",
        sortable: true,
        sortKey: "delta",
        columnWidth: "150px",
        headerAlign: "right",
        headerClassName: "text-right",
        cellClassName: "text-right [&>div]:justify-end",
        render: (account) => <DeltaBadge value={account.delta} />,
      },
      {
        key: "last_updated",
        header: "Last Updated",
        sortable: true,
        sortKey: "last_updated",
        columnWidth: "190px",
        render: (account) => (
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-slate-400">
              stmt {formatDate(account.statement_updated_at)}
            </p>
            <p className="mt-1 truncate text-xs font-medium text-slate-400">
              calc {formatDate(account.calculated_updated_at)}
            </p>
          </div>
        ),
      },
    ],
    [balanceTotals, expandedAccountIds, recentTransactionsLoading, toggleAccountTransactions],
  );

  const recentTransactionColumns = useMemo(() => [
    {
      key: "date",
      header: "Date",
      columnWidth: "120px",
      render: (transaction) => {
        const { date, time } = formatDateAndTime(transaction.txn_date || transaction.created_at);

        return (
          <div className="min-w-0 text-xs font-medium text-slate-500">
            <p>{date}</p>
            <p className="mt-0.5 text-slate-400">{time || "-"}</p>
          </div>
        );
      },
    },
    {
      key: "counterparty",
      header: "Counterparty",
      columnWidth: "500px",
      render: (transaction) => {
        const subtitleParts = [ transaction.mode, transaction.ref_number, ].filter(Boolean);
        const subtitle = subtitleParts.length ? subtitleParts.join(" / ") : cleanText(transaction.narration || transaction.category || "-");

        return (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-950" title={cleanText(transaction.counterparty || transaction.narration)}>
              {cleanText(transaction.counterparty || transaction.narration || "Transaction")}
            </p>
            <p className="mt-1 truncate text-xs font-medium text-slate-400" title={subtitle}>
              {subtitle}
            </p>
          </div>
        );
      },
    },
    {
      key: "txn_type",
      header: "Type",
      columnWidth: "110px",
      headerClassName: "text-center",
      cellClassName: "justify-center",
      render: (transaction) => (
        <div className="flex w-full justify-center">
          <TypeBadge type={transaction.txn_type} />
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      columnWidth: "130px",
      headerClassName: "text-right pr-5",
      cellClassName: "pr-4 text-right [&>div]:justify-end",
      render: (transaction) => (
        <div className="w-full whitespace-nowrap">
          <AmountColor type={transaction.txn_type} amount={transaction.amount} />
        </div>
      ),
    },
  ], []);

  const renderRecentTransactionRows = useCallback((account) => {
    if (!expandedAccountIds[account.id]) return null;

    const transactions = recentTransactionsByAccountId[account.id] || [];
    const isLoadingTransactions = recentTransactionsLoading[account.id];
    const transactionError = recentTransactionsError[account.id];
    const transactionCount = transactions.length;
    const headingCount = isLoadingTransactions ? RECENT_ACCOUNT_TXN_LIMIT : transactionCount;
    const headingLabel = headingCount === 1 ? "Transaction" : "Transactions";

    return (
      <Table.Row className="bg-slate-50">
        <Table.Cell colSpan={columns.length} className="p-4">
          <header className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Last {headingCount} {headingLabel}
            </p>
            {!isLoadingTransactions && transactionCount > 0 ? (
              <button
                type="button"
                onClick={() => viewAllTransactionsForAccount(account)}
                className="flex items-center gap-1 pr-2 text-sm font-semibold text-blue-600 hover:cursor-pointer hover:underline hover:underline-offset-4"
              >
                View All transactions for this account <ExternalLink className="inline h-4.5 w-4.5" />
              </button>
            ) : null}
          </header>

          {isLoadingTransactions ? (
            <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-4 text-sm font-medium text-slate-500">
              <Spinner size="2" />
              Loading recent transactions...
            </div>
          ) : transactionError ? (
            <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {transactionError}
            </div>
          ) : transactionCount === 0 ? (
            <div className="rounded-lg bg-white px-4 py-4 text-sm font-medium text-slate-500">
              No transactions found for this account.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <CustomTable
                columns={recentTransactionColumns}
                data={transactions}
                minWidth={RECENT_ACCOUNT_TXN_TABLE_WIDTH}
                size="1"
                getRowKey={(transaction, idx) => transaction.id || transaction.gmail_message_id || transaction.ref_number || idx}
                emptyMessage="No transactions found for this account"
              />
            </div>
          )}
        </Table.Cell>
      </Table.Row>
    );
  }, [
    columns.length,
    expandedAccountIds,
    recentTransactionsByAccountId,
    recentTransactionsError,
    recentTransactionsLoading,
    recentTransactionColumns,
    viewAllTransactionsForAccount,
  ]);

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    if (key === "date") return false;
    if (key === "search") return Boolean(String(value || "").trim());
    return Array.isArray(value)
      ? value.length > 0
      : value && value !== ALL_FILTER_VALUE;
  });

  return (
    <main className="flex flex-col gap-4">
      <div className="rounded-xl bg-white p-4 shadow-md">

        {/* Page Header */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">All Accounts</h1>
            <p className="mt-1 text-xs font-medium text-slate-500"> Every account in one view — balances, reconciliation health, and last activity </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              color={hasActiveFilters ? "blue" : "gray"}
              variant="soft"
              radius="full"
              className="w-fit px-3 py-1 font-semibold"
            >
              {totalCount} Accounts
            </Badge>

            {/* Filter Button */}
            <CustomButton
              color={hasActiveFilters ? "blue" : "gray"}
              radius="large"
              variant={hasActiveFilters ? "solid" : "outline"}
              size="sm"
              className={`ml-2 ${hasActiveFilters ? "text-white" : "text-gray-900"}!`}
              onClick={() =>setOpenFilter((prev) => !prev)}
            >
              <Filter className="sm:mr-1 h-4 w-4" /> 
              <span className="hidden sm:flex">Filter</span>
            </CustomButton>
            
            <CustomButton
              className="h-9!"
              onClick={() => setAddAccounts((prev) => !prev)}
            >
              <Plus className="h-5 w-5" />
              Add Account
            </CustomButton>
          </div>
        </div>

        {/* Filter Bar */}
        {openFilter &&
          <>
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-9">
              <div className="xl:col-span-2">
                <CustomSearchBar
                  value={draftFilters.search}
                  onChange={(value) => updateDraftFilter("search", value)}
                  placeholder="Search account / bank / holder"
                  iconPosition="right"
                  inputClassName="rounded-md border-gray-200 pl-3 pr-10"
                />
              </div>

              <CustomDropDown
                value={draftFilters.account}
                options={filterOptions.accounts}
                placeholder={getAllOptionLabel(
                  filterOptions.accounts,
                  "All Accounts",
                )}
                onValueChange={(value) => updateDraftFilter("account", value)}
                multiple
                showSearch
                searchPlaceholder="Search accounts..."
                align="start"
                buttonVariant="outline"
                buttonColor="gray"
                buttonSize="2"
                triggerClassName={dropdownTriggerClassName}
                contentClassName={dropdownContentClassName}
              />

              <CustomDropDown
                value={draftFilters.individualAccount}
                options={filterOptions.individualAccounts}
                placeholder={getAllOptionLabel(
                  filterOptions.individualAccounts,
                  "All Individual Accounts",
                )}
                onValueChange={(value) =>
                  updateDraftFilter("individualAccount", value)
                }
                multiple
                showSearch
                searchPlaceholder="Search individual accounts..."
                align="start"
                buttonVariant="outline"
                buttonColor="gray"
                buttonSize="2"
                triggerClassName={dropdownTriggerClassName}
                contentClassName={dropdownContentClassName}
              />

              <CustomDropDown
                value={draftFilters.bank}
                options={filterOptions.banks}
                placeholder={getAllOptionLabel(filterOptions.banks, "All Banks")}
                onValueChange={(value) => updateDraftFilter("bank", value)}
                multiple
                showSearch
                searchPlaceholder="Search banks..."
                align="start"
                buttonVariant="outline"
                buttonColor="gray"
                buttonSize="2"
                triggerClassName={dropdownTriggerClassName}
                contentClassName={dropdownContentClassName}
              />

              <CustomDropDown
                value={draftFilters.category}
                options={filterOptions.categories}
                placeholder={getAllOptionLabel(filterOptions.categories, "All Categories")}
                onValueChange={(value) => updateDraftFilter("category", value)}
                multiple
                showSearch
                searchPlaceholder="Search categories..."
                align="start"
                buttonVariant="outline"
                buttonColor="gray"
                buttonSize="2"
                triggerClassName={dropdownTriggerClassName}
                contentClassName={dropdownContentClassName}
              />

              <CustomDropDown
                value={draftFilters.accountType}
                options={filterOptions.accountTypes}
                placeholder={getAllOptionLabel(
                  filterOptions.accountTypes,
                  "All Account Types",
                )}
                onValueChange={(value) => updateDraftFilter("accountType", value)}
                multiple
                showSearch
                searchPlaceholder="Search account types..."
                align="start"
                buttonVariant="outline"
                buttonColor="gray"
                buttonSize="2"
                triggerClassName={dropdownTriggerClassName}
                contentClassName={dropdownContentClassName}
              />

              <CustomDropDown
                value={draftFilters.accountHolderName}
                options={filterOptions.accountHolderNames}
                placeholder={getAllOptionLabel(
                  filterOptions.accountHolderNames,
                  "All Account Holders",
                )}
                onValueChange={(value) =>
                  updateDraftFilter("accountHolderName", value)
                }
                multiple
                showSearch
                searchPlaceholder="Search account holders..."
                align="start"
                buttonVariant="outline"
                buttonColor="gray"
                buttonSize="2"
                triggerClassName={dropdownTriggerClassName}
                contentClassName={dropdownContentClassName}
              />

              <div className="relative">
                <input
                  type="date"
                  aria-label="Filter accounts by date"
                  title="Filter accounts by date"
                  value={draftFilters.date}
                  onChange={(event) =>
                    updateDraftFilter("date", event.target.value)
                  }
                  className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <CustomButton
                variant="outline"
                color="gray"
                size="2"
                className="h-9!"
                onClick={resetFilters}
              >
                <RotateCcw className="h-4 w-4" />
                Reset Filters
              </CustomButton>

              <CustomButton size="2" className="h-9!" onClick={applyFilters}>
                <Filter className="h-4 w-4" />
                Apply Filters
              </CustomButton>
            </div>
          </>
        }
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <DataCard
            key={card.title}
            compact
            title={card.title}
            value={card.value}
            color={card.color}
            description={card.description}
            indicatorColor={card.indicatorColor}
          />
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isRefreshing && (
          <div className="border-b border-blue-100 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700">
            Updating accounts...
          </div>
        )}

        {loading && accounts.length === 0 ? (
          <div className="flex w-full flex-col items-center justify-center gap-3 py-16">
            <Spinner size="3" />
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700">
                Loading accounts
              </p>
              <p className="mt-1 text-xs font-medium text-slate-400">
                Fetching account balances from the database...
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="m-4 rounded-xl border border-red-100 bg-red-50 p-6 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <CustomTable
                columns={columns}
                data={paginatedAccounts}
                minWidth="1430px"
                getRowKey={(account) => account.id}
                emptyMessage="No accounts found"
                sort={sort}
                onSort={handleSort}
                renderRowDetails={renderRecentTransactionRows}
              />
            </div>

            <Pagination
              currentPage={page}
              totalItems={totalCount}
              pageSize={pageSize}
              itemLabel="accounts"
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
            />
          </>
        )}
      </div>

      <AddAcounts open={addAccounts} setOpen={setAddAccounts}/>
    </main>
  );
};

export default Accounts;
