import React, { useEffect, useMemo, useState } from "react";
import { Badge, Spinner } from "@radix-ui/themes";
import { AlertTriangle, CheckCircle2, ChevronRight, Filter, RotateCcw } from "lucide-react";

import { accountsApi } from "../api/accounts";
import CustomButton from "../components/ui/CustomButton";
import CustomDropDown from "../components/ui/CustomDropDown";
import CustomSearchBar from "../components/ui/CustomSearchBar";
import CustomTable from "../components/ui/CustomTable";
import Pagination from "../components/Pagination";
import { formatAmount, formatDate } from "../lib/helper";
import { getAccountFilterOptions } from "../lib/transactional-helper";

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
  accountType: ALL_FILTER_VALUE,
  accountHolderName: ALL_FILTER_VALUE,
  date: toDateValue(new Date()),
});

const dropdownTriggerClassName = "h-9! w-full justify-between! text-sm";
const dropdownContentClassName = "min-w-56 max-h-72 overflow-y-auto";
const ACCOUNT_CACHE_FETCH_LIMIT = 1000;

const getAllOptionLabel = (options = [], fallback = "All") => (
  options?.find((option) => option?.value === ALL_FILTER_VALUE)?.label || fallback
);

const toNumber = (value) => {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
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
      {amount === null || amount === undefined ? "-" : formatCurrency(amount)}
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
        {formatCurrency(0)}
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
      {formatCompactCurrency(delta)}
    </span>
  );
};

const Accounts = () => {
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

  console.log(accounts)
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
            {/* <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400">
              <ChevronRight className="h-4 w-4" />
            </span> */}

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
        header: "Bal - Statement",
        sortable: true,
        sortKey: "statement_balance",
        columnWidth: "210px",
        headerClassName: "text-right",
        cellClassName: "justify-end",
        render: (account) => (
          <BalanceCell
            amount={account.statement_balance}
            label={`stmt ${formatDate(account.created_at)}`}
          />
        ),
      },
      {
        key: "current_balance",
        header: "Bal - Calculated",
        sortable: true,
        sortKey: "current_balance",
        columnWidth: "210px",
        headerClassName: "text-right",
        render: (account) => (
          <BalanceCell
            amount={account.calculated_balance}
            label={`calc ${formatDate(account.created_at)}`}
            muted={Math.abs(toNumber(account.delta)) < 0.01}
          />
        ),
      },
      {
        key: "delta",
        header: "Delta",
        sortable: true,
        sortKey: "delta",
        columnWidth: "130px",
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
    [],
  );

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    if (key === "search") return Boolean(String(value || "").trim());
    return Array.isArray(value)
      ? value.length > 0
      : value && value !== ALL_FILTER_VALUE;
  });

  return (
    <main className="flex flex-col gap-4">
      <div className="rounded-xl bg-white p-4 shadow-md">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">All Accounts</h1>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Every account in one view — balances, reconciliation health, and last activity
            </p>
          </div>

          <Badge color={hasActiveFilters ? "blue" : "gray"} variant="soft" radius="full" className="w-fit px-3 py-1 font-semibold">
            {totalCount} Accounts
          </Badge>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-8">
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
            placeholder={getAllOptionLabel(filterOptions.accounts, "All Accounts")}
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
            placeholder={getAllOptionLabel(filterOptions.individualAccounts, "All Individual Accounts")}
            onValueChange={(value) => updateDraftFilter("individualAccount", value)}
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
            value={draftFilters.accountType}
            options={filterOptions.accountTypes}
            placeholder={getAllOptionLabel(filterOptions.accountTypes, "All Account Types")}
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
            placeholder={getAllOptionLabel(filterOptions.accountHolderNames, "All Account Holders")}
            onValueChange={(value) => updateDraftFilter("accountHolderName", value)}
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
              onChange={(event) => updateDraftFilter("date", event.target.value)}
              className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <CustomButton variant="outline" color="gray" size="2" className="h-9!" onClick={resetFilters}>
            <RotateCcw className="h-4 w-4" />
            Reset Filters
          </CustomButton>

          <CustomButton size="2" className="h-9!" onClick={applyFilters}>
            <Filter className="h-4 w-4" />
            Apply Filters
          </CustomButton>
        </div>
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
              <p className="text-sm font-semibold text-slate-700">Loading accounts</p>
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
    </main>
  );
};

export default Accounts;
