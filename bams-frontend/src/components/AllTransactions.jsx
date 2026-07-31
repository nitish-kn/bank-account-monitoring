import React, { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Button, Spinner, Tabs } from "@radix-ui/themes";
import { FileSpreadsheet, FileText, TriangleAlert, Filter, Calendar, ChevronDown } from "lucide-react";
import CustomTable from "./ui/CustomTable";
import { cleanText, formatAmount, formatCompactINR, formatDateAndTime, getStatusColor } from "../lib/helper";
import { EmptyMails } from "../utils/EmptyStates";
import Pagination from "./Pagination";
import { transactionApi } from "../api/transactions";
import TransactionFilters from "./TransactionFilters";
import CustomButton from "./ui/CustomButton";
import { useSetupStore } from "../store/setupStore";
import { getTransactionFilterOptionsFromBackend, formatTransactionDateRangeLabel, getDefaultTransactionDateRange } from "../lib/transactional-helper";
import CustomDatePicker from "./ui/CustomDatePicker";
import { ActionBadge, AmountColor, CategoryBadge, SourceBadge, TypeBadge } from "../utils/Badges";

const tabTriggerClassName = "flex-1! justify-center! bg-white! hover:bg-gray-50! border border-gray-50! shadow-md! rounded-md! text-sm font-medium text-gray-900! transition-colors! data-[state=active]:border-b-2! data-[state=active]:border-blue-600! data-[state=active]:text-blue-600! data-[state=active]:hover:bg-white! [&_.rt-BaseTabListTriggerInner]:bg-transparent!";

export function AllTransactions({ user }) {
  const [searchParams] = useSearchParams();
  const initialSortField = searchParams.get("sortField") || "date";
  const initialSortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
  const initialTab = ["transactions", "credit-card", "fastag"].includes(searchParams.get("tab"))
    ? searchParams.get("tab")
    : "transactions";

  const [emailPage, setEmailPage] = useState(1);
  const [emailPageSize, setEmailPageSize] = useState(10);
  const [transactions, setTransactions] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [filterOptions, setFilterOptions] = useState({});
  const [appliedFilters, setAppliedFilters] = useState({});
  const [openFilter, setOpenFilter] = useState(false);
  const refreshTrigger = useSetupStore((state) => state.refreshTrigger);
  const [sort, setSort] = useState({ field: initialSortField, order: initialSortOrder });
  const [tabValue, setTabValue] = useState(initialTab);

  const [dateRange, setDateRange] = useState(getDefaultTransactionDateRange(new Date(), 30));
  const [openDateRangeFilter, setOpenDateRangeFilter] = useState(false);
  const dateRangePopoverRef = useRef(null);

  const maxSelectableDate = useMemo(() => new Date(), []);
  const dateRangeLabel = useMemo(() => formatTransactionDateRangeLabel(dateRange), [dateRange]);

  const handleSort = (field) => {
    setSort((prev) => ({
      field,
      order: prev.field === field && prev.order === "desc" ? "asc" : "desc",
    }));
    setEmailPage(1);
  };

  useEffect(() => {
    if (!openDateRangeFilter) return undefined;

    const handleOutsideClick = (event) => {
      if (
        dateRangePopoverRef.current && !dateRangePopoverRef.current.contains(event.target)) {
        setOpenDateRangeFilter(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [openDateRangeFilter]);

  useEffect(() => {
    transactionApi.getFilterOptions()
      .then((res) => {
        setFilterOptions(getTransactionFilterOptionsFromBackend(res));
      })
      .catch(console.error);
  }, [refreshTrigger]);

  useEffect(() => {
    const fetchTransactions = async () => {
      const shouldShowInitialLoader = transactions.length === 0;
      setError(null);
      setLoading(shouldShowInitialLoader);
      setIsRefreshing(!shouldShowInitialLoader);
      try {
        const payloadFilters = {
          ...appliedFilters,
          dateRange,
          tab: tabValue,
        };
        const res = await transactionApi.queryTransactions(
          payloadFilters,
          { page: emailPage, pageSize: emailPageSize },
          { summary: false, transactions: true },
          sort
        );
        if (res.transactions) {
          setTransactions(res.transactions);
          setTotalCount(res.totalCount || 0);
        }
      } catch (err) {
        setError(err.message || "Failed to fetch transactions");
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    };
    fetchTransactions();
  }, [appliedFilters, emailPage, emailPageSize, refreshTrigger, sort, dateRange, tabValue]);

  const totalEmailPages = Math.max(Math.ceil(totalCount / emailPageSize), 1);

  const hasActiveFilters = Object.keys(appliedFilters).some(
    (key) => appliedFilters[key] && appliedFilters[key] !== "all" && appliedFilters[key].length !== 0
  );

  const emailColumns = useMemo(() => {
    const columns = [
      {
        key: "txn_date",
        header: "Date",
        columnWidth: "120px",
        cellClassName: "whitespace-nowrap",
        sortable: true,
        sortKey: "date",
        render: (transaction) => (
          <p className="text-xs text-gray-700">
            {formatDateAndTime(transaction?.txn_date).date || "-"}
          </p>
        ),
      },
      {
        key: "bank_name",
        header: "Bank / Account",
        columnWidth: "200px",
        sortable: true,
        sortKey: "bank",
        render: (transaction) => (
          <div className="min-w-0 ">
            <p className="truncate text-sm max-w-80 text-black" title={transaction?.bank_name} >
              {transaction?.bank_name || "Unknown bank"}
            </p>
            <p className="mt-0.5 truncate text-xs font-medium! text-gray-800" title={transaction?.account_holder_name}>
              {transaction?.account_holder_name || "-"}
            </p>
            <p className="mt-0.5 truncate text-xs text-gray-500" title={transaction?.account_number}>
              {transaction?.account_number || "-"}
            </p>
          </div>
        ),
      },
      {
        key: "counterparty",
        header: "Counterparty",
        columnWidth: "240px",
        cellClassName: "max-w-[280px]",
        sortable: true,
        render: (transaction) => {
          const counterparty = cleanText(transaction?.counterparty);

          return (
            <p
              className="max-w-72 truncate text-sm leading-6 font-medium text-gray-800"
              title={counterparty}
            >
              {counterparty || "-"}
            </p>
          );
        },
      },
      {
        key: "txn_type",
        header: "TYPE",
        columnWidth: "100px",
        cellClassName: "whitespace-nowrap",
        sortable: true,
        sortKey: "type",
        render: (transaction) => <TypeBadge type={transaction?.txn_type} />
      },
      {
        key: "amount",
        header: "Amount",
        columnWidth: "160px",
        cellClassName: "whitespace-nowrap",
        sortable: true,
        render: (transaction) => <AmountColor type={transaction?.txn_type} amount={transaction?.amount} />
      },
      {
        key: "category",
        header: "Category",
        columnWidth: "160px",
        cellClassName: "",
        sortable: true,
        render: (row) => (
          <CategoryBadge category={row.category} type={row.txn_type} />
        ),
      },
      {
        key: "narration",
        header: "Narration",
        columnWidth: "340px",
        cellClassName: "max-w-[420px]",
        sortable: true,
        render: (transaction) => {
          const narration = cleanText(transaction?.narration || transaction?.email_metadata?.subject);

          return (
            <p
              className="max-w-120 truncate text-mid font-medium leading-6 text-gray-800"
              title={narration}
            >
              {narration || "No narration available"}
            </p>
          );
        },
      },
      {
        key: "source",
        header: "Source",
        columnWidth: "90px",
        cellClassName: "whitespace-nowrap",
        sortable: true,
        render: (transaction) => {
          return (
            <SourceBadge source={transaction?.source} gmail_msg_id={transaction?.gmail_message_id} />
          );
        },
      },
      {
        key: "actions",
        header: "Actions",
        columnWidth: "90px",
        width: "w-20",
        render: (row) => (
          <ActionBadge row={row} />
        ),
      },
    ];

    if (tabValue !== "fastag") {
      return columns;
    }

    const fastagColumns = columns.filter(
      (column) => !["txn_type", "amount"].includes(column.key),
    );
    const actionsIdx = fastagColumns.findIndex((column) => column.key === "actions");
    const insertIdx = actionsIdx === -1 ? fastagColumns.length : actionsIdx;

    fastagColumns.splice(
      insertIdx,
      0,
      {
        key: "vehicle_number",
        header: "Vehicle Number",
        columnWidth: "150px",
        render: (transaction) => (
          <p className="truncate text-sm font-semibold text-gray-900" title={transaction?.optional_fields?.vehicle_number}>
            {transaction?.optional_fields?.vehicle_number || "-"}
          </p>
        ),
      },
      {
        key: "trips_left",
        header: "Trips Left",
        columnWidth: "120px",
        render: (transaction) => (
          <p className="text-sm font-medium text-gray-700">
            {transaction?.optional_fields?.trips_left || "-"}
          </p>
        ),
      },
    );

    return fastagColumns;
  }, [tabValue]);

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Synced Emails Table Section */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-gray-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-start gap-4">
              <p className="text-2xl font-bold text-black text-shadow-xs">
                All Transactions
              </p>

              {/* {!loadingEmails && !syncedError && syncedEmails.length > 0 && (
                <CustomButton size="1" variant="soft" color="blue">
                  <RotateCcw className="w-4 h-4" />
                </CustomButton>
              )} */}
            </div>

            <p className="mt-1 text-xs font-medium text-gray-500 text-shadow-xs">
              Parsed transaction records fetched from your connected sheet
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto mt-2 lg:mt-0">

            <Badge
              size="2"
              color="gray"
              variant="soft"
              radius="full"
              className="px-3 py-1 font-semibold"
            >
              {totalCount} Total
            </Badge>

            {/* Date Range Filter */}
            <div ref={dateRangePopoverRef} className="relative">
              <CustomButton color="gray" radius="large" className="text-gray-800!" variant="outline" size="2" onClick={() => setOpenDateRangeFilter((prev) => !prev)} >
                <Calendar className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">{dateRangeLabel.long}</span>
                <span className="sm:hidden">{dateRangeLabel.short}</span>
                <ChevronDown className="ml-1 h-4 w-4" />
              </CustomButton>

              {openDateRangeFilter && (
                <>
                  <div
                    className="lg:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2"
                    onClick={() => setOpenDateRangeFilter(false)}
                  >
                    <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
                      <CustomDatePicker
                        value={dateRange}
                        onChange={(val) => {
                          setDateRange(val);
                          setEmailPage(1);
                        }}
                        maxDate={maxSelectableDate}
                      />
                    </div>
                  </div>

                  <div className="hidden lg:flex z-20 absolute top-10 right-0 justify-end">
                    <CustomDatePicker
                      value={dateRange}
                      onChange={(val) => {
                        setDateRange(val);
                        setEmailPage(1);
                      }}
                      maxDate={maxSelectableDate}
                    />
                  </div>
                </>
              )}
            </div>

            <CustomButton
              color={hasActiveFilters ? "blue" : "gray"}
              radius="large"
              variant={hasActiveFilters ? "solid" : "outline"}
              size="2"
              className={`ml-2 ${hasActiveFilters ? "text-white" : "text-gray-900"}!`}
              onClick={() => setOpenFilter((prev) => !prev)}
            >
              <Filter className="sm:mr-1 h-4 w-4" />
              <span className="hidden sm:flex">Filter</span>
            </CustomButton>

            {user?.spreadsheet_id && (
              <Button
                size="2"
                color="green"
                radius="400"
                variant="outline"
                className="w-full md:w-auto"
                onClick={() => {
                  window.open(
                    `https://docs.google.com/spreadsheets/d/${user?.spreadsheet_id}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              >
                <FileSpreadsheet
                  fill="green"
                  stroke="white"
                  className="h-5 w-5"
                />
                Open in Google Sheets
              </Button>
            )}
          </div>
        </div>

        <div className="border-b border-gray-100 bg-gray-50/60 px-4 py-3">
          <Tabs.Root
            value={tabValue}
            className="w-full"
            onValueChange={(value) => {
              setTabValue(value);
              setEmailPage(1);
            }}
          >
            <Tabs.List
              className="flex! w-full! gap-2 items-stretch! border-none! shadow-none! rounded-md! h-12!"
              style={{ boxShadow: "none" }}
            >
              <Tabs.Trigger value="transactions" className={tabTriggerClassName}>
                Transactions
              </Tabs.Trigger>
              <Tabs.Trigger value="credit-card" className={tabTriggerClassName}>
                Credit Card
              </Tabs.Trigger>
              <Tabs.Trigger value="fastag" className={tabTriggerClassName}>
                Fastag
              </Tabs.Trigger>
            </Tabs.List>
          </Tabs.Root>
        </div>

        {/* Filter UI */}
        {openFilter && (
          <div className="p-4 bg-gray-50 border-b border-gray-200">
            <TransactionFilters
              filters={appliedFilters}
              filterOptions={filterOptions}
              onApply={(newFilters) => {
                setAppliedFilters(newFilters);
                setEmailPage(1);
              }}
              onReset={() => {
                setAppliedFilters({});
                setEmailPage(1);
              }}
              onOpenChange={() => setOpenFilter(false)}
            />
          </div>
        )}

        {/* Optional filter/search bar */}
        {/* <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/60 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 ml-auto">
            <TextField.Root
              size="2"
              placeholder="Search subject or parsed content..."
              className="w-full md:w-72"
            />

            <Button size="2" variant="soft" color="gray">
              Filter
            </Button>
          </div>
        </div> */}

        {/* Content */}
        <div>

          {/* Loading State */}
          {loading && transactions.length === 0 ? (

            <div className="flex w-full flex-col items-center justify-center gap-3 py-16">
              <Spinner size="3" />

              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">
                  Loading transactions
                </p>
                <p className="mt-1 text-xs font-medium text-gray-400">
                  Please wait while we fetch latest transactions from your sheet...
                </p>
              </div>
            </div>

          ) : error ? (

            // If an error occured while loading new mails
            <div className="m-4 rounded-xl border border-red-100 bg-red-50 p-6 flex flex-col items-center justify-center gap-4 overflow-hidden">
              <TriangleAlert className="text-red-600 shrink-0" size={64} />

              <div className="text-center">
                <p className="text-sm font-bold text-red-700">
                  Unable to load transactions
                </p>
                <p className="mt-1 text-xs font-medium text-red-500">
                  Please try again.
                </p>
              </div>

              <pre className="max-h-32 w-full overflow-auto rounded-lg border border-red-100 bg-white/70 p-3 text-left text-xs leading-5 text-red-600 whitespace-pre-wrap break-words">
                {error}
              </pre>
            </div>
          ) : transactions.length === 0 ? (

            // No error but, no emails to show
            <EmptyMails heading="No transactions found" description="Adjust your filters or sync new transactions." />
          ) : (

            // The main table to show the parsed data
            <>
              <div className="relative">
                {isRefreshing && (
                  <div className="absolute right-4 top-3 z-20 rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-semibold text-blue-600 shadow-sm">
                    Updating...
                  </div>
                )}

                <CustomTable
                  columns={emailColumns}
                  data={transactions}
                  minWidth="1320px"
                  getRowKey={(transaction, idx) => transaction.id || transaction.gmail_message_id || transaction.ref_number || idx}
                  emptyMessage="No synced transactions found"
                  sort={sort}
                  onSort={handleSort}
                />
              </div>

              <Pagination
                currentPage={emailPage}
                totalItems={totalCount}
                pageSize={emailPageSize}
                itemLabel="transactions"
                onPageChange={setEmailPage}
                onPageSizeChange={(nextPageSize) => {
                  setEmailPageSize(nextPageSize);
                  setEmailPage(1);
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
