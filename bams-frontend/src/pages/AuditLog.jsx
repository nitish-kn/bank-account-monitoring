import React, { useEffect, useState, useMemo, useRef } from "react";
import CustomTable from "../components/ui/CustomTable";
import CustomInput from "../components/ui/CustomInput";
import Pagination from "../components/Pagination";
import DialogPopup from "../components/ui/DialogPopup";
import { transactionApi } from "../api/transactions";
import { formatDateAndTime } from "../lib/helper";
import { History, ShieldAlert, User, Globe, Calendar, ChevronDown, ChevronUp, Eye, Code, Maximize2, Search } from "lucide-react";
import { Table } from "@radix-ui/themes";
import CustomButton from "../components/ui/CustomButton";
import CustomDatePicker from "../components/ui/CustomDatePicker";
import { getDefaultTransactionDateRange, formatTransactionDateRangeLabel } from "../lib/transactional-helper";
import { useExportContextStore } from "../store/exportContextStore";

const fieldLabels = {
  category: "Category",
  narration: "Narration",
  counterparty: "Counterparty",
  account_number: "Account Number",
  account_holder_name: "Account Holder Name",
  txn_date: "Transaction Date",
  mode: "Mode",
  ref_number: "Reference ID",
  amount: "Amount",
  txn_type: "Transaction Type"
};

const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [operatorFilter, setOperatorFilter] = useState("");

  const [dateRange, setDateRange] = useState(() => getDefaultTransactionDateRange(new Date(), 30));
  const [openDateRangeFilter, setOpenDateRangeFilter] = useState(false);
  const dateRangePopoverRef = useRef(null);

  const [expandedLogs, setExpandedLogs] = useState({});
  const [viewJsonLog, setViewJsonLog] = useState(null);

  const maxSelectableDate = useMemo(() => new Date(), []);
  const dateRangeLabel = useMemo(() => formatTransactionDateRangeLabel(dateRange), [dateRange]);

  useEffect(() => {
    if (!openDateRangeFilter) return undefined;

    const handleOutsideClick = (event) => {
      if (dateRangePopoverRef.current && !dateRangePopoverRef.current.contains(event.target)) {
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

  const fetchAuditLogs = async () => {
    setLoading(true);
    setError("");
    try {
      const params = {
        page,
        pageSize,
        search: searchTerm.trim() || undefined,
        changed_by: operatorFilter.trim() || undefined,
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
      };
      const res = await transactionApi.getAuditLogs(params);
      setLogs(res.logs || []);
      setTotalCount(res.totalCount || 0);
    } catch (err) {
      setError(err.message || "Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [page, pageSize, operatorFilter, dateRange]);

  const setExportContext = useExportContextStore((state) => state.setExportContext);

  // Publish what's currently on screen so the global Export Data dialog can
  // default to "export exactly what I'm filtered to right now".
  useEffect(() => {
    setExportContext("audit-log", {
      filters: {
        search: searchTerm.trim() || undefined,
        changed_by: operatorFilter.trim() || undefined,
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
      },
    });
  }, [searchTerm, operatorFilter, dateRange, setExportContext]);

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    setPage(1);
    fetchAuditLogs();
  };

  const toggleExpand = (logId) => {
    setExpandedLogs((prev) => ({
      ...prev,
      [logId]: !prev[logId],
    }));
  };

  const columns = useMemo(() => {
    return [
      {
        key: "changed_by",
        header: "OPERATOR",
        columnWidth: "100px",
        render: (row) => (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600 shrink-0">
              <User className="h-4 w-4" />
            </div>
            <span className="font-semibold text-gray-900 text-sm">{row.changed_by || "System"}</span>
          </div>
        ),
      },
      {
        key: "created_at",
        header: "WHEN",
        columnWidth: "100px",
        render: (row) => {
          const { date, time } = formatDateAndTime(row.created_at);
          return (
            <div className="text-xs text-gray-600">
              <div className="font-semibold">{date}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{time}</div>
            </div>
          );
        },
      },
      {
        key: "txn_narration",
        header: "NARRATION",
        columnWidth: "300px",
        render: (row) => (
          <div className="max-w-sm">
            <p className="text-sm font-medium text-gray-700 truncate" title={row.txn_narration}>
              {row.txn_narration}
            </p>
          </div>
        ),
      },
      {
        key: "changes",
        header: "CHANGES",
        columnWidth: "150px",
        render: (row) => {
          const isExpanded = !!expandedLogs[row.id];
          const changesCount = Object.keys(row.changes || {}).length;
          return (
            <div className="flex justify-start w-full">
              <CustomButton
                type="button"
                color="blue"
                size="1"
                variant="soft"
                radius="large"
                onClick={() => toggleExpand(row.id)}
                className="font-semibold text-[11px] gap-1 px-2.5 py-1"
              >
                {changesCount} {changesCount === 1 ? "field" : "fields"} changed
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </CustomButton>
            </div>
          );
        },
      },
      {
        key: "reason",
        header: "REASON",
        columnWidth: "180px",
        render: (row) => (
          <div className="text-xs text-gray-600 max-w-[170px] truncate" title={row.reason || ""}>
            {row.reason || <span className="text-gray-400 italic">No reason</span>}
          </div>
        ),
      },
      {
        key: "ip_address",
        header: "IP ADDRESS",
        columnWidth: "80px",
        render: (row) => (
          <div className="flex items-center gap-1.5 text-xs font-mono text-gray-500">
            <Globe className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span>{row.ip_address}</span>
          </div>
        ),
      },
    ];
  }, [expandedLogs]);

  const renderRowDetails = (log) => {
    const isExpanded = !!expandedLogs[log.id];
    if (!isExpanded) return null;

    return (
      <Table.Row>
        <Table.Cell colSpan={columns.length}>
          <Table.Root variant="surface" className="w-full text-left text-xs border border-gray-100 rounded-lg overflow-hidden">
            <Table.Header className="bg-blue-50 text-gray-600 font-bold text-xs">
              <Table.Row>
                <Table.ColumnHeaderCell className="p-2.5 w-1/3">FIELD</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell className="p-2.5 w-1/3">BEFORE</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell className="p-2.5 w-1/3">AFTER</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>

            <Table.Body className="divide-y divide-gray-100">
              {Object.entries(log.changes || {}).map(([field, val]) => (

                <Table.Row key={field} align="center" className="hover:bg-slate-50/20">
                  <Table.Cell className="p-2.5 align-middle font-bold text-gray-800 capitalize">
                    {fieldLabels[field] || field.replace(/_/g, " ")}
                  </Table.Cell>

                  <Table.Cell className="p-2.5 align-middle">
                    <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-medium text-red-700 bg-red-50 border border-red-100/50 max-w-85 truncate" title={String(val.old)}>
                      {val.old === null || val.old === "" ? "(empty)" : String(val.old)}
                    </span>
                  </Table.Cell>

                  <Table.Cell className="p-2.5 align-middle">
                    <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold text-green-700 bg-green-50 border border-green-100/50 max-w-85 truncate" title={String(val.new)}>
                      {val.new === null || val.new === "" ? "(empty)" : String(val.new)}
                    </span>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>

          {/* Accordion Collapse Trigger */}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200/80 px-4 py-1.5 rounded-full hover:bg-gray-50 shadow-xs transition"
              onClick={() => toggleExpand(log.id)}
            >
              <ChevronUp className="w-3.5 h-3.5" />
              Show less
            </button>
          </div>
        </Table.Cell>
      </Table.Row>
    );
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Header */}
      <div className="space-y-4 bg-white p-4 pb-6 rounded-xl border border-gray-200 shadow-md">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-xs text-gray-500 font-medium">History of manual modifications on transactions</p>
        </div>

        {/* Filters Section */}
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <CustomInput
              value={searchTerm}
              onChange={(val) => setSearchTerm(val)}
              placeholder="Search reason or IP address..."
              icon={Search}
            />
          </div>
          <div className="w-full sm:w-60">
            <CustomInput
              value={operatorFilter}
              onChange={(val) => setOperatorFilter(val)}
              placeholder="Filter by operator name..."
              icon={Search}
            />
          </div>

          {/* Date Range Filter */}
          <div ref={dateRangePopoverRef} className="relative w-full sm:w-auto">
            <CustomButton
              type="button"
              color="gray"
              radius="large"
              className="text-gray-800! w-full sm:w-auto h-9!"
              variant="outline"
              size="2"
              onClick={() => setOpenDateRangeFilter((prev) => !prev)}
            >
              <Calendar className="mr-1 h-4 w-4 shrink-0" />
              <span className="truncate">{dateRangeLabel.long}</span>
              <ChevronDown className="ml-1 h-4 w-4 shrink-0" />
            </CustomButton>

            {openDateRangeFilter && (
              <div className="absolute right-0 top-10 z-20 origin-top-right">
                <CustomDatePicker
                  value={dateRange}
                  onChange={(val) => {
                    setDateRange(val);
                    setPage(1);
                  }}
                  maxDate={maxSelectableDate}
                />
              </div>
            )}
          </div>

          <div className="w-full sm:w-auto">
            <CustomButton
              type="submit"
              className="w-full h-9!"
            >
              Apply Filters
            </CustomButton>
          </div>
        </form>

        {/* Error State */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm font-medium">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

      </div>


      {/* Table Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">

        <div className="overflow-hidden">
          <CustomTable
            columns={columns}
            data={logs}
            isLoading={loading}
            getRowKey={(row) => row.id}
            renderRowDetails={renderRowDetails}
          />
        </div>

        {/* Pagination */}
        {totalCount > 0 && (
          <Pagination
            currentPage={page}
            pageSize={pageSize}
            totalItems={totalCount}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </div>
    </div>

  );
};

export default AuditLog;
