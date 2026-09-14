import React, { useEffect, useMemo, useRef, useState } from "react";
import { Flag, Calendar, ChevronDown, Pencil, CheckCircle2, Search } from "lucide-react";
import { toast } from "react-toastify";
import { transactionApi } from "../api/transactions";
import CustomTable from "../components/ui/CustomTable";
import CustomButton from "../components/ui/CustomButton";
import CustomInput from "../components/ui/CustomInput";
import CustomDatePicker from "../components/ui/CustomDatePicker";
import Pagination from "../components/Pagination";
import EditTransactionDialog from "../components/ui/EditTransactionDialog";
import { AmountColor } from "../utils/Badges";
import { EmptyMails } from "../utils/EmptyStates";
import { formatTransactionDateRangeLabel, getDefaultTransactionDateRange } from "../lib/transactional-helper";
import { displayRefNumber, formatDateAndTime } from "../lib/helper";
import { useSetupStore } from "../store/setupStore";
import { Badge } from "@radix-ui/themes";
import { usePermissions, PERMISSIONS } from "../lib/permissions";

const errorText = (err, fallback) => err?.response?.data?.detail || err?.message || fallback;

const NeedsReview = () => {
  const can = usePermissions();
  // This page's whole review workflow -- select, unflag, edit a flagged
  // row -- runs on needs_review.update alone, independent of any other
  // module. PUT /transactions/{id} accepts either transactions.update or
  // needs_review.update, so someone with just this permission can actually
  // use the Edit button, not merely see it.
  const canReview = can(PERMISSIONS.NEEDS_REVIEW_UPDATE);
  const refreshTrigger = useSetupStore((state) => state.refreshTrigger);

  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");

  // Filters on created_at (when the row landed in our DB), not txn_date.
  const [createdRange, setCreatedRange] = useState(() => getDefaultTransactionDateRange(new Date(), 30));
  const [openDateFilter, setOpenDateFilter] = useState(false);
  const dateFilterRef = useRef(null);
  const maxSelectableDate = useMemo(() => new Date(), []);
  const dateRangeLabel = useMemo(() => formatTransactionDateRangeLabel(createdRange), [createdRange]);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editTarget, setEditTarget] = useState(null);
  const [unflagging, setUnflagging] = useState(false);

  // Debounced so typing doesn't fire a query per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!openDateFilter) return undefined;
    const handleOutsideClick = (event) => {
      if (dateFilterRef.current && !dateFilterRef.current.contains(event.target)) {
        setOpenDateFilter(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [openDateFilter]);

  const loadRows = async () => {
    setLoading(true);
    try {
      const res = await transactionApi.queryFlagged({ createdRange, search: debouncedSearch }, { page, pageSize });
      setRows(res.transactions || []);
      setTotalCount(res.totalCount || 0);
    } catch (err) {
      toast.error(errorText(err, "Failed to load flagged transactions."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdRange, debouncedSearch, page, pageSize, refreshTrigger]);

  // A selection shouldn't survive a page/filter change once the row behind
  // it is no longer on screen -- keeps "N selected" honest.
  useEffect(() => {
    setSelectedIds((prev) => {
      const visibleIds = new Set(rows.map((row) => row.id));
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));

  const toggleRow = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((row) => row.id)));
  };

  const handleUnflagSelected = async () => {
    if (!selectedIds.size) return;
    setUnflagging(true);
    try {
      const count = selectedIds.size;
      await transactionApi.unflagTransactions([...selectedIds]);
      toast.success(`${count} transaction${count === 1 ? "" : "s"} marked as unflagged.`);
      setSelectedIds(new Set());
      loadRows();
    } catch (err) {
      toast.error(errorText(err, "Failed to unflag the selected transactions."));
    } finally {
      setUnflagging(false);
    }
  };

  const columns = useMemo(
    () => [
      canReview && {
        key: "select",
        header: (
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Select all flagged transactions on this page"
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        ),
        columnWidth: "48px",
        render: (row) => (
          <input
            type="checkbox"
            checked={selectedIds.has(row.id)}
            onChange={() => toggleRow(row.id)}
            aria-label={`Select transaction ${row.id}`}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        ),
      },
      {
        key: "txn_date",
        header: "Date",
        columnWidth: "150px",
        render: (row) => {
          const { date, time } = formatDateAndTime(row.txn_date);
          return (
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-800">{row.txn_date ? date : "-"}</p>
              {time && <p className="text-xs text-gray-400">{time}</p>}
              {row.has_edits && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
                  <Pencil className="h-2.5 w-2.5" /> Edited
                </span>
              )}
            </div>
          );
        },
      },
      {
        key: "account",
        header: "Account",
        columnWidth: "170px",
        render: (row) => (
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-800">{row.bank_name || "-"}</p>
            <p className="text-sm font-semibold text-gray-800">{row.account_holder_name || "-"}</p>
            <p className="text-xs text-gray-400">{row.account_number || "-"}</p>
          </div>
        ),
      },
      {
        key: "narration",
        header: "Description / Counterparty",
        columnWidth: "260px",
        render: (row) => (
          <div className="min-w-0 text-left">
            <p className="truncate text-sm font-semibold text-gray-800" title={row.narration}>
              {row.narration || row.counterparty || "-"}
            </p>
            <p className="text-xs text-gray-400">Ref: {displayRefNumber(row.ref_number)}</p>
          </div>
        ),
      },
      {
        key: "amount",
        header: "Amount",
        columnWidth: "130px",
        headerAlign: "right",
        render: (row) => <AmountColor type={row.txn_type} amount={row.amount} />,
      },
      {
        key: "flag_reason",
        header: "Flag Reason",
        columnWidth: "220px",
        // Not wired up yet -- reads optional_fields.flagged_reason, which
        // nothing writes to today, so this always falls back for now.
        render: (row) => (
          <span className="text-sm text-gray-500">
            {row.optional_fields?.flagged_reason || "No reason available"}
          </span>
        ),
      },
      canReview && {
        key: "actions",
        header: "Actions",
        columnWidth: "80px",
        render: (row) => (
          <CustomButton
            variant="outline"
            color="gray"
            size="1"
            className="h-8! w-8! p-0!"
            aria-label="Edit transaction"
            onClick={() => setEditTarget(row)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </CustomButton>
        ),
      },
    ].filter(Boolean),
    [selectedIds, allSelected, canReview],
  );

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Flagged Transactions</h1>
            <p className="text-xs text-gray-500 font-medium">
              Review and fix transactions that are missing important information or look unusual.
            </p>
          </div>

          <Badge
            size="2"
            color="gray"
            variant="soft"
            radius="full"
            className="w-fit px-4! py-1.5! font-semibold text-gray-700!"
          >
            {totalCount} Total Flagged
          </Badge>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <CustomInput
            className="max-w-sm flex-1"
            value={search}
            onChange={setSearch}
            placeholder="Search by ID, narration, counterparty, ref no..."
            icon={Search}
            autoComplete="off"
          />

          <div className="flex items-center gap-2">
            {canReview && selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-blue-700">{selectedIds.size} selected</span>
                <CustomButton
                  variant="surface"
                  color="green"
                  size="2"
                  onClick={handleUnflagSelected}
                  disabled={unflagging}
                >
                  <CheckCircle2 className="h-4 w-4" /> {unflagging ? "Marking..." : "Mark as Unflagged"}
                </CustomButton>
              </div>
            )}

            <div ref={dateFilterRef} className="relative">
              <CustomButton
                color="gray"
                variant="outline"
                size="2"
                className="text-gray-800!"
                onClick={() => setOpenDateFilter((prev) => !prev)}
              >
                <Calendar className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">{dateRangeLabel.long}</span>
                <span className="sm:hidden">{dateRangeLabel.short}</span>
                <ChevronDown className="ml-1 h-4 w-4" />
              </CustomButton>

              {openDateFilter && (
                <div className="absolute z-20 top-10 right-0">
                  <CustomDatePicker
                    value={createdRange}
                    onChange={(val) => {
                      setCreatedRange(val);
                      setPage(1);
                    }}
                    maxDate={maxSelectableDate}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {!loading && rows.length === 0 ? (
          <EmptyMails
            icon={<Flag className="h-10 w-10 text-gray-400" />}
            heading="Nothing flagged"
            description="Every transaction has the information it needs -- flagged rows will show up here."
          />
        ) : (
          <CustomTable
            columns={columns}
            data={rows}
            isLoading={loading}
            getRowKey={(row) => row.id}
            emptyMessage="No flagged transactions in this date range."
          />
        )}

        <Pagination
          currentPage={page}
          totalItems={totalCount}
          pageSize={pageSize}
          itemLabel="entries"
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>

      <EditTransactionDialog open={Boolean(editTarget)} setOpen={(open) => !open && setEditTarget(null)} data={editTarget} />
    </div>
  );
};

export default NeedsReview;
