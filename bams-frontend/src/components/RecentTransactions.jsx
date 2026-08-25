import React, { useEffect, useMemo, useState } from "react";
import CustomTable from "./ui/CustomTable";
import { EllipsisVertical, Eye, FileText, MoreHorizontal, Search } from "lucide-react";
import { Button } from "@radix-ui/themes";
import { formatAmount, formatCompactINR, formatDateAndTime } from "../lib/helper";
import Pagination from "./Pagination";
import CustomInput from "./ui/CustomInput";
import DialogPopup from "./ui/DialogPopup";
import CustomPopover from "./ui/CustomPopover";
import CustomButton from "./ui/CustomButton";
import ActionList from "./ui/ActionList";
import { ActionBadge, AmountColor, CategoryBadge, SourceBadge, TypeBadge } from "../utils/Badges";

const RecentTransactions = ({
  transactions = [],
  tabValue,
  sort,
  onSort,
  isLoading = false,
  currentPage = 1,
  pageSize = 10,
  totalCount = transactions.length,
  onPageChange,
  onPageSizeChange,
}) => {
  const [searchTerm, setSearchTerm] = useState("");



  const columns = useMemo(() => {
    let baseCols = [
      {
        key: "date",
        header: "Date",
        columnWidth: "120px",
        width: "w-28",
        sortable: true,
        sortKey: "date",
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
        key: "bank_name",
        header: "Bank Name",
        columnWidth: "270px",
        width: "w-72",
        sortable: true,
        sortKey: "bank",
        render: (row) => (
          ((row?.txn_via === "Credit Card") ?
            <div className="max-w-60 w-fit">
              <p className="font-semibold text-gray-900 text-sm"> {row?.optional_fields?.credit_card_issuer || "Unknown Bank"} </p>
              <p className="text-xs font-medium text-gray-800 truncate"> {row?.optional_fields?.credit_card_owner || "-"} </p>
              <p className="text-xs text-gray-500 truncate"> {row?.optional_fields?.credit_card_number || "-"} </p>
            </div>
            :
            <div className="max-w-60 w-fit">
              <p className="font-semibold text-gray-900 text-sm"> {row?.bank_name || "Unknown Bank"} </p>
              <p className="text-xs font-medium text-gray-800 truncate"> {row?.account_holder_name || "-"} </p>
              <p className="text-xs text-gray-500 truncate"> {row?.account_number || "-"} </p>
            </div>)
        ),
      },
      {
        key: "counterparty",
        header: "Counterparty",
        columnWidth: "260px",
        width: "w-90",
        sortable: true,
        render: (row) => (
          <div className="max-w-60 w-fit">
            <p className="font-semibold text-gray-900 text-sm">
              {row?.counterparty || row?.source_name || "Transaction"}
            </p>
          </div>
        ),
      },
      {
        key: "category",
        header: "Category",
        columnWidth: "170px",
        sortable: true,
        render: (row) => (
          <CategoryBadge category={row.category} type={row.txn_type} />
        ),
      },
      {
        key: "txn_type",
        header: "Type",
        columnWidth: "110px",
        width: "w-28",
        sortable: true,
        sortKey: "type",
        render: (row) => <TypeBadge type={row.txn_type} />,
      },
      {
        key: "amount",
        header: "Amount",
        columnWidth: "150px",
        width: "w-40",
        sortable: true,
        render: (row) => <AmountColor type={row?.txn_type} amount={row?.amount} />
      },
      {
        key: "balance_after_txn",
        header: "Balance",
        columnWidth: "150px",
        width: "w-36",
        sortable: true,
        sortKey: "balance",
        render: (row) => (
          <div className="text-sm w-full text-right text-gray-700 font-medium">
            ₹ {formatAmount(row.balance_after_txn) || "-"}
          </div>
        ),
      },
      {
        key: "source_name",
        header: "Source",
        columnWidth: "90px",
        width: "w-16",
        sortable: true,
        sortKey: "source",
        render: (row) => <SourceBadge source={row?.source} gmail_msg_id={row?.gmail_message_id} />,
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

    if (tabValue === "fastag") {
      baseCols = baseCols.filter(c => !["txn_type", "amount", "balance_after_txn"].includes(c.key));

      const actionsIdx = baseCols.findIndex(c => c.key === "actions");
      const newCols = [
        {
          key: "vehicle_number",
          header: "Vehicle Number",
          columnWidth: "150px",
          render: (row) => (
            <div className="font-semibold text-gray-900 text-sm">
              {row?.optional_fields?.vehicle_number || "-"}
            </div>
          ),
        },
        {
          key: "trips_left",
          header: "Trips Left",
          columnWidth: "120px",
          render: (row) => (
            <div className="text-sm text-gray-700">
              {row?.optional_fields?.trips_left || "-"}
            </div>
          ),
        },
      ];

      baseCols.splice(actionsIdx, 0, ...newCols);
    }

    return baseCols;
  }, [tabValue]);

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

  const totalItems = searchTerm ? filteredTransactions.length : totalCount;
  const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);

  useEffect(() => {
    onPageChange?.(1);
  }, [onPageChange, searchTerm]);

  useEffect(() => {
    if (currentPage > totalPages) {
      onPageChange?.(totalPages);
    }
  }, [currentPage, onPageChange, totalPages]);

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-3 sm:p-4">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Recent Transactions</h2>

          <div className="hidden lg:flex items-center gap-3">
            {isLoading && (
              <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
                Updating...
              </span>
            )}
            <CustomInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search transactions..."
              icon={Search}
              className="w-72"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <CustomTable
            columns={columns}
            data={filteredTransactions}
            minWidth="1410px"
            emptyMessage="No transactions found"
            getRowKey={(row, idx) => row?.primary_dedupe_key || idx}
            sort={sort}
            onSort={onSort}
          />
        </div>
        <Pagination
          currentPage={currentPage}
          totalItems={totalItems}
          pageSize={pageSize}
          itemLabel="transactions"
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      </div>

    </>
  );
};

export default RecentTransactions;
