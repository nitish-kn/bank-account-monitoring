import React, { useEffect, useMemo, useState } from "react";
import CustomTable from "./ui/CustomTable";
import { Eye, FileText, MoreHorizontal } from "lucide-react";
import { Button } from "@radix-ui/themes";
import { formatAmount, formatCompactINR, formatDateAndTime } from "../lib/helper";
import Pagination from "./Pagination";
import CustomSearchBar from "./ui/CustomSearchBar";
import DialogPopup from "./ui/DialogPopup";

const TypeBadge = ({ type }) => {
  const normalizedType = String(type || "").trim().toLowerCase();
  const isCredit = normalizedType === "credit";
  const isDebit = normalizedType === "debit";

  if (!isCredit && !isDebit) {
    return (
      <span className="inline-flex items-center rounded-md! bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
        -
      </span>
    );
  }

  const bgColor = isCredit ? "bg-green-100" : "bg-red-100";
  const textColor = isCredit ? "text-green-600" : "text-red-600";
  const label = isCredit ? "Credit" : "Debit";

  return (
    <span
      className={`inline-flex items-center rounded-md! px-2.5 py-1 text-xs font-semibold ${bgColor} ${textColor}`}
    >
      {label}
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
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-sm font-medium text-blue-700`}
    >
      {category ? category : "Others"}
    </span>
  );
};

const SourceBadge = ({ source }) => {
  return (
    <div className="flex items-center justify-center w-full gap-1">
      {source ? (
        // Email source
        <div className="flex items-center">
          <img src="./gmail-icon.png" alt="Gmail" className="w-5 h-5" />
        </div>
      ) : 
        <span><FileText className="text-blue-600 w-5 h-5"/></span>
      }
    </div>
  );
};

const RecentTransactions = ({ transactions = [], tabValue, sort, onSort, isLoading = false }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openDialog, setOpenDialog] = useState(false);
  const [data, setData] = useState({});
  
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
          <div className="max-w-60 w-fit">
            <p className="font-semibold text-gray-900 text-sm"> {row?.bank_name || "Unknown Bank"} </p>
            <p className="text-xs font-medium text-gray-800 truncate"> {row?.account_holder_name || "-"} </p>
            <p className="text-xs text-gray-500 truncate"> {row?.account_number || "-"} </p>
          </div>
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
        render: (row) => {
          const normalizedType = String(row.txn_type || "").trim().toLowerCase();
          const isCredit = normalizedType === "credit";
          const isDebit = normalizedType === "debit";
          const amountValue = parseFloat(row.amount || 0);
          const sign = isCredit ? "+" : "−";
          const color = isCredit ? "text-green-600" : isDebit ? "text-red-500" : "text-gray-700";

          return (
            <div className={`text-sm font-semibold w-full text-right ${color}`}>
              {sign} ₹ {formatAmount(amountValue)}
            </div>
          );
        },
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
        render: (row) => <SourceBadge source={row?.gmail_message_id} />,
      },
      {
        key: "actions",
        header: "Actions",
        columnWidth: "90px",
        width: "w-20",
        render: (row) => (
          <Button
            color="gray"
            variant="ghost"
            size="1"
            className="hover:bg-gray-100 flex items-center justify-center w-full!"
          >
            <Eye className="h-5 w-5 font-bold" onClick={() => {
              setOpenDialog(true);
              setData(row);
            }}/>
          </Button>
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

  const totalPages = Math.max(Math.ceil(filteredTransactions.length / pageSize), 1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize, sort]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [currentPage, filteredTransactions, pageSize]);

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
            minWidth="1410px"
            emptyMessage="No transactions found"
            getRowKey={(row, idx) => row?.primary_dedupe_key || idx}
            sort={sort}
            onSort={onSort}
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

      <DialogPopup open={openDialog} setOpen={setOpenDialog} subheading="Transaction Details">
        {data ? (
          <div className="text-sm text-gray-900 w-full">
            <p>Narration - <span className="font-medium text-lg">{data?.narration}</span></p>
            <p>Transaction Date - <span className="font-medium text-lg">{formatDateAndTime(data?.txn_date).date}</span></p>
            <p>Account Number - <span className="font-medium text-lg">{data?.account_number}</span></p>
            <p>Reference Number - <span className="font-medium text-lg">{data?.ref_number}</span></p>
            <p>Category - <span className="font-medium text-lg">{data?.category}</span></p>
            <p>Transaction Type - <span className="font-medium text-lg">{data?.txn_type}</span></p>
            <p>Amount - <span className="font-medium text-lg">{formatAmount(data?.amount)}</span></p>
            <p>Balance After Transaction - <span className="font-medium text-lg">{formatAmount(data?.balance_after_txn)}</span></p>
            <p>Account Holder Name - <span className="font-medium text-lg">{data?.account_holder_name}</span></p>
            <p>Counter Party Name - <span className="font-medium text-lg">{data?.counter_party_name}</span></p>
            
          </div>
        ) : (
          <div className="text-sm text-gray-500">No transaction details available.</div>
        )}
      </DialogPopup>
    </>
  );
};

export default RecentTransactions;
