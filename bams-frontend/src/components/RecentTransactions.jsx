import React, { useEffect, useMemo, useState } from "react";
import CustomTable from "./ui/CustomTable";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@radix-ui/themes";
import { formatAmount, formatCompactINR, formatDateAndTime } from "../lib/helper";
import Pagination from "./Pagination";
import CustomSearchBar from "./ui/CustomSearchBar";

const TypeBadge = ({ type }) => {
  const isCredit = String(type).toLowerCase() === "credit";
  const bgColor = isCredit ? "bg-green-100" : "bg-red-100";
  const textColor = isCredit ? "text-green-600" : "text-red-600";

  return (
    <span
      className={`inline-flex items-center rounded-md! px-2.5 py-1 text-xs font-semibold ${bgColor} ${textColor}`}
    >
      {type}
    </span>
  );
};

const CategoryBadge = ({ category, type }) => {
  const isCredit = String(type).toLowerCase() === "credit";
  const bgColor = isCredit ? "bg-green-50" : "bg-red-50";
  const textColor = isCredit ? "text-green-600" : "text-red-600";
  const borderColor = isCredit ? "border-green-200" : "border-red-200";

  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium border ${bgColor} ${textColor} ${borderColor}`}
    >
      {category}
    </span>
  );
};

const SourceBadge = ({ source }) => {
  return (
    <div className="flex items-center gap-1">
      {source === "Gmail" && (
        <>
          <span className="text-red-500 font-bold">M</span>
          <span className="text-sm font-medium text-gray-700">{source}</span>
        </>
      )}
    </div>
  );
};

const RecentTransactions = ({ transactions = [] }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const columns = useMemo(
    () => [
      {
        key: "date",
        header: "Date",
        width: "w-28",
        render: (row) => {
          const { date, time } = formatDateAndTime(row.txn_date);

          return (
            <div className="text-xs text-gray-700">
              <div className="font-medium">{date}</div>
              {time && <div className="text-gray-500">{time}</div>}
            </div>
          );
        },
      },
      {
        key: "counterparty",
        header: "Counterparty",
        width: "w-90",
        render: (row) => (
          <div className="max-w-60 w-fit">
            <p className="font-semibold text-gray-900 text-sm">
              {row?.counterparty || row?.source_name || "Transaction"}
            </p>
            {/* <p className="text-xs text-gray-500 truncate">
              {row?.ref_number || "No reference"}
            </p> */}
          </div>
        ),
      },
      {
        key: "bank_name",
        header: "Bank Name",
        width: "w-72",
        render: (row) => (
          <div className="max-w-60 w-fit">
            <p className="font-semibold text-gray-900 text-sm">
              {row?.bank_name || "Unknown Bank"}
            </p>
            {/* <p className="text-xs text-gray-500 truncate">
              {row?.ref_number || "No reference"}
            </p> */}
          </div>
        ),
      },
      {
        key: "account_number",
        header: "Account",
        width: "w-28",
        render: (row) => (
          <div className="text-xs font-medium text-gray-600">
            {row?.account_number}
          </div>
        ),
      },
      {
        key: "txn_type",
        header: "Type",
        width: "w-28",
        render: (row) => <TypeBadge type={row.txn_type} />,
      },
      {
        key: "category",
        header: "Category",
        render: (row) => (
          <CategoryBadge category={row.category} type={row.txn_type} />
        ),
      },
      {
        key: "amount",
        header: "Amount",
        width: "w-40",
        render: (row) => {
          const isCredit = String(row.txn_type).toLowerCase() === "credit";
          const amountValue = parseFloat(row.amount || 0);
          const sign = isCredit ? "+" : "−";
          const color = isCredit ? "text-green-600" : "text-red-500";

          return (
            <div className={`text-sm font-semibold ${color}`}>
              {sign} {formatCompactINR(amountValue)}
            </div>
          );
        },
      },
      {
        key: "balance_after_txn",
        header: "Balance",
        width: "w-28",
        render: (row) => (
          <div className="text-sm text-gray-700 font-medium">
            {formatCompactINR(row.balance_after_txn) || "-"}
          </div>
        ),
      },
      //   {
      //     key: "source_name",
      //     header: "Source",
      //     width: "w-16",
      //     render: (row) => <SourceBadge source={row.source_name || "Unknown"} />,
      //   },
      // {
      //   key: "actions",
      //   header: "",
      //   width: "w-16",
      //   render: () => (
      //     <Button
      //       color="gray"
      //       variant="ghost"
      //       size="1"
      //       className="hover:bg-gray-100"
      //     >
      //       <MoreHorizontal className="h-4 w-4" />
      //     </Button>
      //   ),
      // },
    ],
    [],
  );

  const filteredTransactions = useMemo(() => {
    if (!searchTerm) return transactions;

    const term = searchTerm.toLowerCase();
    return transactions.filter(
      (txn) =>
        String(txn.counterparty || "").toLowerCase().includes(term) ||
        String(txn.category || "").toLowerCase().includes(term) ||
        String(txn.account_number || "").includes(term) ||
        String(txn.ref_number || "").includes(term)
    );
  }, [transactions, searchTerm]);

  const totalPages = Math.max(Math.ceil(filteredTransactions.length / pageSize), 1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [currentPage, filteredTransactions, pageSize]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-3 sm:p-4">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Recent Transactions</h2>

        <div className="hidden lg:flex items-center gap-3">
          <CustomSearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search transactions..."
            className="w-72"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <CustomTable
          columns={columns}
          data={paginatedTransactions}
          minWidth="1200px"
          emptyMessage="No transactions found"
          getRowKey={(row, idx) => row?.primary_dedupe_key || idx}
        />
      </div>
      <Pagination
        currentPage={currentPage}
        totalItems={filteredTransactions.length}
        pageSize={pageSize}
        itemLabel="transactions"
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
};

export default RecentTransactions;
