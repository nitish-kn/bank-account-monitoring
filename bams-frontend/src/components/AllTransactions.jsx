import React, { useEffect, useMemo, useState } from "react";
import { Badge, Button, Spinner } from "@radix-ui/themes";
import { FileSpreadsheet, FileText, TriangleAlert, Filter } from "lucide-react";
import CustomTable from "./ui/CustomTable";
import { cleanText, formatAmount, formatCompactINR, formatDateAndTime, getStatusColor } from "../lib/helper";
import { EmptyMails } from "../utils/EmptyStates";
import Pagination from "./Pagination";
import { transactionApi } from "../api/transactions";
import TransactionFilters from "./TransactionFilters";
import CustomButton from "./ui/CustomButton";

export function AllTransactions({ user, isSyncing, syncMessage, lastSyncAt, syncDashboard }) {
  const [emailPage, setEmailPage] = useState(1);
  const [emailPageSize, setEmailPageSize] = useState(10);
  const [transactions, setTransactions] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [filterOptions, setFilterOptions] = useState({});
  const [appliedFilters, setAppliedFilters] = useState({});
  const [openFilter, setOpenFilter] = useState(false);

  useEffect(() => {
    transactionApi.getFilterOptions().then(setFilterOptions).catch(console.error);
  }, []);

  useEffect(() => {
    const fetchTransactions = async () => {
      setLoading(true);
      try {
        const res = await transactionApi.queryTransactions(
          appliedFilters,
          { page: emailPage, pageSize: emailPageSize },
          { summary: false, transactions: true }
        );
        if (res.transactions) {
          setTransactions(res.transactions);
          setTotalCount(res.totalCount || 0);
        }
      } catch (err) {
        setError(err.message || "Failed to fetch transactions");
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, [appliedFilters, emailPage, emailPageSize]);

  const totalEmailPages = Math.max(Math.ceil(totalCount / emailPageSize), 1);
  
  const hasActiveFilters = Object.keys(appliedFilters).some(
    (key) => appliedFilters[key] && appliedFilters[key] !== "all" && appliedFilters[key].length !== 0
  );

  const emailColumns = [
    {
      key: "txn_date",
      header: "Date",
      cellClassName: "whitespace-nowrap",
      render: (transaction) => (
        <p className="text-xs text-gray-700">
          {formatDateAndTime(transaction?.txn_date).date || "-"}
        </p>
      ),
    },
    {
      key: "bank_name",
      header: "Bank / Account",
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
    // {
    //   key: "account_holder_name",
    //   header: "Account Holder Name",
    //   cellClassName: "max-w-[280px]",
    //   render: (transaction) => {
    //     const accountHolderName = cleanText(transaction?.account_holder_name);

    //     return (
    //       <p
    //         className="max-w-72 truncate text-sm font-medium leading-6 text-gray-800"
    //         title={accountHolderName}
    //       >
    //         {accountHolderName || "-"}
    //       </p>
    //     );
    //   },
    // },
    {
      key: "txn_type",
      header: "Credit / Debit",
      cellClassName: "whitespace-nowrap",
      render: (transaction) => {
        const transactionType = transaction?.txn_type?.toLowerCase();
        const status = transaction?.parser_metadata?.parsed_status?.toLowerCase();
        const statusColor = status === "not_transaction"
          ? "gray"
          : transactionType === "debit"
            ? "red"
            : transactionType === "credit"
              ? "green"
              : getStatusColor(status);
        const label = transaction?.txn_type || transaction?.parser_metadata?.parsed_status || "Parsed";

        return (
          <Badge
            color={statusColor}
            variant="soft"
            radius="full"
            className="font-semibold capitalize"
          >
            {label}
          </Badge>
        );
      },
    },
    {
      key: "amount",
      header: "Amount",
      cellClassName: "whitespace-nowrap",
      render: (transaction) => {
        const amount = transaction?.amount || transaction?.inr_equivalent;
        return (
          <p className={`w-full ${amount ? "text-right" : "text-center"} text-sm font-semibold text-gray-900`}>
            {amount ? `₹ ${formatAmount(amount)}` : "-"}
          </p>
        );
      },
    },
    {
      key: "counterparty",
      header: "Counterparty",
      cellClassName: "max-w-[280px]",
      render: (transaction) => {
        const counterparty = cleanText(transaction?.counterparty);

        return (
          <p
            className="max-w-72 truncate text-sm leading-6 text-gray-800"
            title={counterparty}
          >
            {counterparty || "-"}
          </p>
        );
      },
    },
    {
      key: "narration",
      header: "Narration",
      cellClassName: "max-w-[420px]",
      render: (transaction) => {
        const narration = cleanText(transaction?.narration || transaction?.email_metadata?.subject);

        return (
          <p
            className="max-w-120 truncate text-sm leading-6 text-gray-800"
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
      cellClassName: "whitespace-nowrap",
      render: (transaction) => {
        const isEmail = transaction?.source === "email";

        return (
          <div className="flex items-center justify-center w-full gap-1">
            {isEmail ? (
              // Email source
              <div className="flex items-center">
                <img src="./gmail-icon.png" alt="Gmail" className="w-5 h-5" />
              </div>
            ) : 
              <span><FileText className="text-blue-600 w-5 h-5"/></span>
            }
          </div>
        );
      },
    },
  ];

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Synced Emails Table Section */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
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
            <CustomButton
              color={hasActiveFilters ? "blue" : "gray"}
              radius="large"
              variant={hasActiveFilters ? "solid" : "outline"}
              size="2"
              className={`ml-2 ${hasActiveFilters ? "text-white" : "text-gray-900"}!`}
              onClick={() =>setOpenFilter((prev) => !prev)}
            >
              <Filter className="sm:mr-1 h-4 w-4" /> 
              <span className="hidden sm:flex">Filter</span>
            </CustomButton>

            <Badge
              size="2"
              color="gray"
              variant="soft"
              radius="full"
              className="px-3 py-1 font-semibold"
            >
              {totalCount} Total
            </Badge>

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

        {isSyncing && (
          <div className="border-b border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">
            {syncMessage || "Syncing your last 30 days of emails in the background. New rows may appear gradually."}
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
        <div className="overflow-x-auto">

          {/* Loading State */}
          {loading ? (

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
              <CustomTable
                columns={emailColumns}
                data={transactions}
                minWidth="900px"
                getRowKey={(transaction, idx) => transaction.id || transaction.gmail_message_id || transaction.ref_number || idx}
                emptyMessage="No synced transactions found"
              />

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
