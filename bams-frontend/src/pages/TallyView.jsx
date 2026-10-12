import { useEffect, useMemo, useRef, useState } from "react";
import { Checkbox, Spinner, Tabs } from "@radix-ui/themes";
import { Calendar, ChevronDown, Download, FileText, Pencil, Filter, UserCog, Plus } from "lucide-react";
import { toast } from "react-toastify";
import Pagination from "../components/Pagination";
import CustomTable from "../components/ui/CustomTable";
import CustomDropDown from "../components/ui/CustomDropDown";
import CustomButton from "../components/ui/CustomButton";
import CustomInput from "../components/ui/CustomInput";
import CustomDatePicker from "../components/ui/CustomDatePicker";
import DialogPopup from "../components/ui/DialogPopup";
import EditTransactionDialog from "../components/ui/EditTransactionDialog";
import TransactionFilters from "../components/TransactionFilters";
import { usePermissions, PERMISSIONS } from "../lib/permissions";
import { getTallyCredentials, saveTallyCredentials, tallyApi } from "../api/tally";
import { transactionApi } from "../api/transactions";
import { useSetupStore } from "../store/setupStore";
import { cleanText, formatDateAndTime, formatINR } from "../lib/helper";
import { DEFAULT_TRANSACTION_FILTERS, getTransactionFilterOptionsFromBackend, formatTransactionDateRangeLabel, getDefaultTransactionDateRange } from "../lib/transactional-helper";

const VOUCHER_TYPES = ["Payment", "Receipt", "Contra", "Journal"];

const norm = (value) => String(value || "").trim().toLowerCase();
const isPushable = (row) =>
  !row.tally_synced_at && row.txn_date && Number(row.amount) !== 0 && Number.isFinite(Number(row.amount)) &&
  ["credit", "debit"].includes(norm(row.txn_type));

const isReady = (row) =>
  isPushable(row) && row.company && row.bankLedger && row.counterpartyLedger &&
  norm(row.bankLedger) !== norm(row.counterpartyLedger) && row.voucherType;

// A picked value shows as a light-blue trigger, an empty one as a plain outline.
const RowDropDown = ({ value, ...props }) => (
  <CustomDropDown
    value={value}
    buttonVariant={value ? "soft" : "outline"}
    buttonColor={value ? "blue" : "gray"}
    triggerClassName={`w-full! justify-between! h-8! text-xs! ${value ? "text-gray-900!" : ""}`}
    matchTriggerWidth
    align="start"
    {...props}
  />
);

// Read-only value a pushed row was sent to Tally with ("-" for rows pushed before these were saved).
const PushedValue = ({ value }) => (
  <p className="w-full min-w-0 truncate text-xs font-semibold text-gray-900" title={value}>{value || "-"}</p>
);

const LedgerCell = ({ value, sourceName, options, onChange, disabled }) => (
  <div className="w-full min-w-0">
    <RowDropDown
      options={options}
      value={value}
      onValueChange={onChange}
      placeholder="Select ledger"
      disabled={disabled}
      showSearch
      searchPlaceholder="Search ledgers..."
    />
    <p className="mt-1 ml-1 truncate text-xs font-medium text-gray-700" title={sourceName}>{cleanText(sourceName) || "-"}</p>
  </div>
);

const TallyView = () => {
  const triggerRefresh = useSetupStore((state) => state.triggerRefresh);
  const refreshTrigger = useSetupStore((state) => state.refreshTrigger);
  const can = usePermissions();
  // Same permissions the edit endpoint (PUT /transactions/{id}) accepts.
  const canEdit = can(PERMISSIONS.TRANSACTIONS_UPDATE) || can(PERMISSIONS.NEEDS_REVIEW_UPDATE);
  // Ledgers + companies from Tally; null until loaded.
  const [tally, setTally] = useState(null);
  const [dateRange, setDateRange] = useState(() => getDefaultTransactionDateRange(new Date(), 30));
  const [openDateFilter, setOpenDateFilter] = useState(false);
  const dateFilterRef = useRef(null);
  const maxSelectableDate = useMemo(() => new Date(), []);
  const dateRangeLabel = useMemo(() => formatTransactionDateRangeLabel(dateRange), [dateRange]);
  // Every row loaded so far, keyed by id, so mappings and selections survive page changes.
  const [rowsById, setRowsById] = useState({});
  const [pageIds, setPageIds] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editTarget, setEditTarget] = useState(null);
  const [confirmPushOpen, setConfirmPushOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  // "checking" | "offline" | "online" -- checked before credentials are needed.
  const [connection, setConnection] = useState("checking");
  const [tallyRetry, setTallyRetry] = useState(0);
  const [pushing, setPushing] = useState(false);
  const [credentials, setCredentials] = useState(getTallyCredentials);
  const [configureOpen, setConfigureOpen] = useState(false);
  const [userDraft, setUserDraft] = useState(() => getTallyCredentials() || { username: "", password: "" });
  const [savingUser, setSavingUser] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRange, setImportRange] = useState(null);
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    setImporting(true);
    try {
      const { found, imported, already_in_app: alreadyInApp, skipped } = await tallyApi.importVouchers(importRange);
      const lines = [
        `${found} ${found === 1 ? "voucher" : "vouchers"} found in Tally`,
        `${imported} new ${imported === 1 ? "row" : "rows"} imported`,
        `${alreadyInApp} skipped (already in the app)`,
      ];
      if (skipped) lines.push(`${skipped} skipped (no ledger entries)`);
      toast.success(<div>{lines.map((line) => <p key={line}>{line}</p>)}</div>, { autoClose: 8000 });
      setImportOpen(false);
      if (imported) {
        triggerRefresh();
        setReload((value) => value + 1);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || "Failed to import from Tally.");
    } finally {
      setImporting(false);
    }
  };
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [savingLedger, setSavingLedger] = useState(false);
  const [ledgerDraft, setLedgerDraft] = useState({ name: "", parent: "", openingBalance: "" });
  const [openFilter, setOpenFilter] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_TRANSACTION_FILTERS);
  const [filterOptions, setFilterOptions] = useState({});
  const [statusTab, setStatusTab] = useState("pending");
  const [reload, setReload] = useState(0);
  const [bulk, setBulk] = useState({ company: null, bankLedger: null, counterpartyLedger: null, voucherType: null });

  const resetSelection = () => {
    setSelectedIds(new Set());
    setBulk({ company: null, bankLedger: null, counterpartyLedger: null, voucherType: null });
    setPage(1);
  };

  useEffect(() => {
    let cancelled = false;
    transactionApi.getFilterOptions().then((result) => {
      if (!cancelled) setFilterOptions(getTransactionFilterOptionsFromBackend(result));
    }).catch(() => { });
    return () => { cancelled = true; };
  }, []);

  const handleConfigure = async () => {
    setSavingUser(true);
    setDialogError("");
    try {
      const next = { username: userDraft.username.trim(), password: userDraft.password };
      saveTallyCredentials(next);
      setCredentials(next);
      setTally(null);
      setRowsById({});
      resetSelection();
      setConfigureOpen(false);
      toast.success("Tally user configured.");
    } catch (err) {
      setDialogError(err.response?.data?.detail || err.message);
    } finally {
      setSavingUser(false);
    }
  };

  const openLedgerDialog = async () => {
    setDialogError("");
    setLedgerDraft({ name: "", parent: "", openingBalance: "" });
    setLedgerOpen(true);
    setLoadingGroups(true);
    setGroups([]);
    try {
      const result = await tallyApi.getGroups();
      setGroups(result.groups || []);
    } catch (err) {
      setDialogError(err.response?.data?.detail || err.message);
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleCreateLedger = async () => {
    setSavingLedger(true);
    setDialogError("");
    try {
      await tallyApi.createLedger({
        name: ledgerDraft.name.trim(), parent: ledgerDraft.parent,
        ...(ledgerDraft.openingBalance !== "" ? { openingBalance: ledgerDraft.openingBalance } : {}),
      });
      setLedgerOpen(false);
      toast.success("Ledger added successfully.");
      try {
        const result = await tallyApi.getLedgers();
        setTally((current) => ({ ...current, ledgers: result.ledgers || [] }));
      } catch {
        toast.error("Ledger added, but the ledger list could not be refreshed. Reload the page.");
      }
    } catch (err) {
      setDialogError(err.response?.data?.detail || err.message);
    } finally {
      setSavingLedger(false);
    }
  };

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

  useEffect(() => {
    let isCancelled = false;
    setConnection("checking");
    // No credentials sent: this only asks whether Tally is reachable.
    tallyApi.getHealth(null)
      .then(() => {
        if (isCancelled) return;
        setConnection("online");
        if (!getTallyCredentials()) {
          setUserDraft({ username: "", password: "" });
          setDialogError("");
          setConfigureOpen(true);
        }
      })
      .catch(() => {
        if (!isCancelled) setConnection("offline");
      });
    return () => {
      isCancelled = true;
    };
  }, [tallyRetry]);

  useEffect(() => {
    if (!credentials || connection !== "online") return undefined;
    let isCancelled = false;
    setLoading(true);
    setLoadError("");

    Promise.all([tallyApi.getLedgers(), tallyApi.getCompanies()])
      .then(([ledgerRes, companyRes]) => {
        if (!isCancelled) setTally({ ledgers: ledgerRes.ledgers || [], companies: companyRes.companies || [] });
      })
      .catch((err) => {
        if (isCancelled) return;
        // 503 = Tally or the bridge isn't reachable; anything else is a real error worth showing.
        if (err.response?.status === 503) setConnection("offline");
        else setLoadError(err.response?.data?.detail || err.message || "Failed to load Tally data.");
        setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [credentials, connection]);

  useEffect(() => {
    if (!tally) return undefined;

    let isCancelled = false;
    setLoading(true);
    setLoadError("");

    transactionApi
      .queryTransactions(
        { ...filters, dateRange, tallyStatus: statusTab, excludeFlagged: false },
        { page, pageSize },
        { transactions: true, summary: false },
      )
      .then((res) => {
        if (isCancelled) return;
        const transactions = res.transactions || [];
        setRowsById((current) => {
          const next = { ...current };
          transactions.forEach((txn) => {
            if (next[txn.id]) {
              // Keep the Tally mappings picked so far; take everything else fresh, including edits.
              next[txn.id] = { ...next[txn.id], ...txn };
              return;
            }
            next[txn.id] = {
              ...txn,
              company: null,
              bankLedger: null,
              counterpartyLedger: null,
              voucherType: null,
              narration: txn.narration || "",
              error: null,
            };
          });
          return next;
        });
        setPageIds(transactions.map((txn) => txn.id));
        setTotalCount(res.totalCount || 0);
      })
      .catch((err) => {
        if (!isCancelled) setLoadError(err.response?.data?.detail || err.message || "Failed to load transactions.");
      })
      .finally(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [tally, dateRange, page, pageSize, filters, statusTab, reload, refreshTrigger]);

  const ready = Boolean(credentials) && connection === "online";
  const companyOptions = tally?.companies || [];
  const ledgerOptions = useMemo(() => (tally?.ledgers || []).map((l) => ({ label: l.name, value: l.name })), [tally?.ledgers]);
  const tabOf = (row) => (row.source === "tally" ? "imported" : row.tally_synced_at ? "pushed" : "pending");
  const rows = pageIds.map((id) => rowsById[id]).filter((row) => row && tabOf(row) === statusTab);
  const readyRows = rows.filter(isReady);
  const selectableRows = rows.filter((row) => !row.tally_synced_at);
  const allReadySelected = selectableRows.length > 0 && selectableRows.every((row) => selectedIds.has(row.id));
  // Selection spans every page visited, not just the one on screen.
  const selectedRows = Object.values(rowsById).filter((row) => selectedIds.has(row.id) && !row.tally_synced_at);
  const selectedReady = selectedRows.filter(isReady);

  const updateRow = (id, patch) =>
    setRowsById((current) => ({ ...current, [id]: { ...current[id], error: null, ...patch } }));

  const toggleSelected = (id, checked) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const bulkPatch = Object.fromEntries(Object.entries(bulk).filter(([, value]) => value));
  const hasBulkValues = Object.keys(bulkPatch).length > 0;

  const applyBulk = () =>
    setRowsById((current) => Object.fromEntries(Object.entries(current).map(([id, row]) => [
      id, selectedIds.has(id) && !row.tally_synced_at ? { ...row, ...bulkPatch, error: null } : row,
    ])));

  const clearBulk = () => setBulk({ company: null, bankLedger: null, counterpartyLedger: null, voucherType: null });

  const togglePageSelection = (checked) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      selectableRows.forEach((row) => (checked ? next.add(row.id) : next.delete(row.id)));
      return next;
    });

  const handlePush = async () => {
    if (!selectedRows.length || selectedReady.length !== selectedRows.length) return;
    const items = selectedReady.map((row) => ({
      id: row.id,
      company: row.company,
      debit_ledger: row.bankLedger,
      credit_ledger: row.counterpartyLedger,
      voucher_type: row.voucherType,
      narration: row.narration,
    }));

    setPushing(true);
    try {
      const { results = [] } = await tallyApi.push(items);
      setRowsById((current) => {
        const next = { ...current };
        results.forEach((result) => {
          if (!next[result.id]) return;
          next[result.id] = result.ok
            ? { ...next[result.id], tally_synced_at: result.tally_synced_at, tally_voucher: result.tally_voucher, error: null }
            : { ...next[result.id], error: result.error };
        });
        return next;
      });
      setSelectedIds(new Set(results.filter((result) => !result.ok).map((result) => result.id)));

      const pushedCount = results.filter((result) => result.ok).length;
      const failedCount = results.length - pushedCount;
      if (pushedCount) {
        toast.success(`${pushedCount} ${pushedCount === 1 ? "transaction" : "transactions"} pushed to Tally.`);
        triggerRefresh();
        setReload((value) => value + 1);
      }
      if (failedCount) toast.error(`${failedCount} failed to push. Check the highlighted rows.`);
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || "Failed to push to Tally.");
    } finally {
      setPushing(false);
      setConfirmPushOpen(false);
    }
  };

  const allColumns = [
    {
      key: "select",
      header: (
        <Checkbox
          checked={allReadySelected}
          disabled={selectableRows.length === 0 || pushing}
          onCheckedChange={(checked) => togglePageSelection(checked === true)}
        />
      ),
      columnWidth: "45px",
      render: (row) => (
        <Checkbox
          checked={selectedIds.has(row.id)}
          disabled={Boolean(row.tally_synced_at) || pushing}
          onCheckedChange={(checked) => toggleSelected(row.id, checked === true)}
        />
      ),
    },
    {
      key: "txn_date",
      header: "Date",
      columnWidth: "120px",
      render: (row) => {
        const { date } = formatDateAndTime(row.txn_date);
        return (
          <div className="text-xs text-gray-700">{date}</div>
        );
      },
    },
    {
      key: "txn_type",
      header: "Txn Type",
      columnWidth: "90px",
      render: (row) => <span className="text-xs font-medium uppercase text-gray-700">{row.txn_type || "-"}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      columnWidth: "120px",
      render: (row) => (

        <span className="text-mid font-semibold text-gray-900">
          {row.amount != null ? formatINR(Math.abs(Number(row.amount))) : "-"}
        </span>
      ),
    },
    {
      key: "category",
      header: "Category",
      columnWidth: "130px",
      render: (row) => <span className="truncate text-xs text-gray-700">{cleanText(row.category) || "-"}</span>,
    },
    {
      key: "company",
      header: "Company",
      columnWidth: "170px",
      render: (row) => row.tally_synced_at ? <PushedValue value={row.tally_voucher?.company} /> : (
        <RowDropDown
          options={companyOptions}
          value={row.company}
          onValueChange={(value) => updateRow(row.id, { company: value })}
          placeholder="Select company"
          emptyMessage="No company open in Tally"
          disabled={pushing}
        />
      ),
    },
    {
      key: "counterparty",
      header: "Counterparty",
      headerSubtext: "(Credit Ledger)",
      headerSubtextClassName: "text-xs! font-medium! text-gray-500!",
      columnWidth: "210px",
      render: (row) => row.tally_synced_at
        ? <PushedValue value={row.tally_voucher?.credit_ledger} />
        : (
        <LedgerCell
          value={row.counterpartyLedger}
          sourceName={row.counterparty}
          options={ledgerOptions}
          disabled={pushing}
          onChange={(value) => updateRow(row.id, { counterpartyLedger: value })}
        />
      ),
    },
    {
      key: "bank_name",
      header: "Bank Name",
      headerSubtext: "(Debit Ledger)",
      headerSubtextClassName: "text-xs! font-medium! text-gray-500!",
      columnWidth: "210px",
      render: (row) => row.tally_synced_at
        ? <PushedValue value={row.tally_voucher?.debit_ledger} />
        : (
        <LedgerCell
          value={row.bankLedger}
          sourceName={row.bank_name}
          options={ledgerOptions}
          disabled={pushing}
          onChange={(value) => updateRow(row.id, { bankLedger: value })}
        />
      ),
    },
    {
      key: "mode",
      header: "Mode",
      columnWidth: "120px",
      render: (row) => <span className="text-xs text-gray-700">{cleanText(row.mode) || "-"}</span>,
    },
    {
      key: "txn_via",
      header: "Txn Via",
      columnWidth: "130px",
      render: (row) => <span className="text-xs text-gray-700">{cleanText(row.txn_via) || "-"}</span>,
    },
    {
      key: "narration",
      header: "Narration",
      columnWidth: "250px",
      render: (row) => (
        <div className="w-full min-w-0">
          <p className="line-clamp-2 text-xs text-gray-700" title={row.narration}>{row.narration || "-"}</p>
          {row.error && <p className="mt-1 text-xs font-medium text-red-600">{row.error}</p>}
        </div>
      ),
    },
    {
      key: "voucher_type",
      header: "Voucher Type",
      headerSubtextClassName: "text-xs! font-medium! text-gray-500!",
      columnWidth: "160px",
      render: (row) => {
        if (row.tally_synced_at) return <PushedValue value={row.tally_voucher?.voucher_type} />;
        return (
          <RowDropDown
            options={VOUCHER_TYPES}
            value={row.voucherType}
            placeholder="Select voucher"
            onValueChange={(value) => updateRow(row.id, { voucherType: value })}
            disabled={pushing}
          />
        );
      },
    },
    {
      key: "action",
      header: "Action",
      columnWidth: "96px",
      render: (row) => (
        <div className="flex items-center ml-2 gap-1.5">
          <CustomButton
            variant="soft"
            size="1"
            disabled={!canEdit || Boolean(row.tally_synced_at) || pushing}
            onClick={() => setEditTarget(row)}
            title={canEdit ? "Edit transaction" : "You don't have permission to edit transactions"}
          >
            <Pencil className="h-3.5 w-3.5" />
          </CustomButton>
        </div>
      ),
    },
  ];
  // Imported rows carry their own account (the bank side of the voucher) and its Tally bank details,
  // so show those instead of the voucher's debit/credit ledgers.
  const importedColumn = (column) => {
    if (column.key === "counterparty") {
      return [{ ...column, headerSubtext: undefined, render: (row) => <PushedValue value={row.counterparty} /> }];
    }
    if (column.key === "bank_name") {
      return [
        { ...column, headerSubtext: undefined, render: (row) => <PushedValue value={row.bank_name} /> },
        { key: "account_holder_name", header: "Account Holder", columnWidth: "170px",
          render: (row) => <PushedValue value={cleanText(row.account_holder_name)} /> },
        { key: "account_number", header: "Account No", columnWidth: "150px",
          render: (row) => <PushedValue value={row.account_number} /> },
      ];
    }
    if (column.key === "voucher_type") {
      return [column, { key: "ref_number", header: "Voucher No", columnWidth: "110px",
        render: (row) => <PushedValue value={row.ref_number} /> }];
    }
    return [column];
  };

  // Pushed and imported rows are already in Tally: nothing to select or edit.
  const columns = statusTab !== "pending"
    ? allColumns
      .filter((column) => column.key !== "select" && column.key !== "action")
      .flatMap((column) => (statusTab === "imported" ? importedColumn(column) : [column]))
      .map((column) => ({
        ...column,
        cellClassName: `${column.cellClassName || ""} py-5!`,
      }))
    : allColumns;

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Push to Tally</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <CustomButton variant="outline" color="gray" className="text-gray-800!" disabled={pushing} onClick={() => {
              setUserDraft(credentials || { username: "", password: "" });
              setDialogError("");
              setConfigureOpen(true);
            }}><UserCog className="h-4 w-4" /> Configure User</CustomButton>
            <CustomButton variant="outline" color="gray" className="text-gray-800!" disabled={!tally || pushing} onClick={openLedgerDialog}>
              <Plus className="h-4 w-4" /> Add Ledger
            </CustomButton>
            <CustomButton variant="outline" color="gray" className="text-gray-800!" disabled={!ready || pushing} onClick={() => {
              setImportRange(dateRange);
              setImportOpen(true);
            }}>
              <Download className="h-4 w-4" /> Import from Tally
            </CustomButton>
            <CustomButton variant="outline" color="gray" className="text-gray-800!" disabled={!ready || pushing} onClick={() => setOpenFilter((value) => !value)}>
              <Filter className="h-4 w-4" /> Filters
            </CustomButton>
            <div ref={dateFilterRef} className="relative">
              <CustomButton
                color="gray"
                variant="outline"
                size="2"
                className="text-gray-800!"
                disabled={!ready || pushing}
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
                    value={dateRange}
                    onChange={(val) => {
                      setDateRange(val);
                      resetSelection();
                    }}
                    maxDate={maxSelectableDate}
                  />
                </div>
              )}
            </div>

          </div>
        </div>

        {ready && statusTab === "pending" && 
          <div className="mt-4 flex flex-col gap-5 border-t border-gray-200 pt-4 text-sm">
            
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-2 font-semibold text-gray-800">
                <FileText className="h-4 w-4 text-blue-600" />
                {selectedRows.length} {selectedRows.length === 1 ? "transaction" : "transactions"} selected
              </span>
              
              <span className="flex items-center gap-2 text-gray-700">
                <span className="h-2 w-2 rounded-full bg-green-500" /> {readyRows.length} Ready to push on this page
              </span>

              <CustomButton className="ml-auto!" onClick={() => setConfirmPushOpen(true)} disabled={!selectedRows.length || selectedReady.length !== selectedRows.length || pushing || loading}>
                {pushing ? (
                  <span className="flex items-center gap-2">
                    <Spinner size="1" /> Pushing...
                  </span>
                ) : (
                  `Push ${selectedRows.length || ""} to Tally`
                )}
              </CustomButton>
            </div>

            <div className="flex items-center gap-2">
              {[
                ["company", "Select company", companyOptions],
                ["bankLedger", "Select debit ledger", ledgerOptions],
                ["counterpartyLedger", "Select credit ledger", ledgerOptions],
                ["voucherType", "Select voucher", VOUCHER_TYPES],
              ].map(([field, placeholder, options]) => (
                <div key={field} className="w-44">
                  <RowDropDown value={bulk[field]} options={options} placeholder={placeholder}
                    onValueChange={(value) => setBulk((current) => ({ ...current, [field]: value }))} showSearch
                    disabled={!selectedRows.length || pushing} />
                </div>
              ))}

              <div className="ml-auto flex items-center gap-2">
                <CustomButton variant="soft" color="gray" onClick={clearBulk} disabled={!hasBulkValues || pushing}>
                  Clear all
                </CustomButton>
                <CustomButton onClick={applyBulk} disabled={!hasBulkValues || !selectedRows.length || pushing}>
                  Apply
                </CustomButton>
              </div>
            </div>
          </div>
        }
      </div>

      {openFilter && <TransactionFilters filters={filters} filterOptions={filterOptions}
        onOpenChange={() => setOpenFilter(false)}
        onApply={(value) => { setFilters(value); resetSelection(); setOpenFilter(false); }}
        onReset={() => { setFilters(DEFAULT_TRANSACTION_FILTERS); resetSelection(); }} />}

      {ready && <Tabs.Root value={statusTab} onValueChange={(value) => {
        setStatusTab(value); resetSelection();
      }}>
        <Tabs.List>
          <Tabs.Trigger value="pending" disabled={pushing}>Not Pushed</Tabs.Trigger>
          <Tabs.Trigger value="pushed" disabled={pushing}>Pushed</Tabs.Trigger>
          <Tabs.Trigger value="imported" disabled={pushing}>Imported</Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {connection === "checking" ? (
          <p className="p-10 text-center text-sm text-gray-600">Checking Tally connection...</p>
        ) : connection === "offline" ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm font-semibold text-gray-800">Tally not connected</p>
            <p className="text-xs text-gray-500">Open Tally with your company loaded, then try again.</p>
            <CustomButton variant="soft" onClick={() => setTallyRetry((value) => value + 1)}>Retry</CustomButton>
          </div>
        ) : !credentials ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm font-semibold text-gray-800">Tally connected</p>
            <p className="text-xs text-gray-500">Configure your Tally user to view and push transactions.</p>
            <CustomButton variant="soft" onClick={() => {
              setUserDraft({ username: "", password: "" });
              setDialogError("");
              setConfigureOpen(true);
            }}><UserCog className="h-4 w-4" /> Configure User</CustomButton>
          </div>
        ) : loadError ? (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600">{loadError}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <CustomTable
                columns={columns}
                data={rows}
                minWidth={statusTab === "imported" ? "2260px" : "1830px"}
                isLoading={loading}
                emptyMessage={{
                  pending: "No transactions to push in this date range.",
                  pushed: "No pushed transactions in this date range.",
                  imported: "No transactions imported from Tally in this date range.",
                }[statusTab]}
              />
            </div>
            <Pagination
              currentPage={page}
              totalItems={totalCount}
              pageSize={pageSize}
              itemLabel="transactions"
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
            />
          </>
        )}
      </div>
      <DialogPopup open={configureOpen} setOpen={setConfigureOpen} heading="Configure Tally User"
        showButtons successbtntxt="Save" onConfirm={handleConfigure} isConfirming={savingUser}
        confirmDisabled={!userDraft.username.trim() || userDraft.username.includes(":") || !userDraft.password}>
        <div className="space-y-4">
          <CustomInput id="tally-username" labelText="Username" autoComplete="username" value={userDraft.username}
            onChange={(username) => setUserDraft((current) => ({ ...current, username }))} />
          <CustomInput id="tally-password" labelText="Password" type="password" autoComplete="current-password" value={userDraft.password}
            onChange={(password) => setUserDraft((current) => ({ ...current, password }))} />
          {dialogError && <p className="text-sm text-red-600">{dialogError}</p>}
        </div>
      </DialogPopup>
      <DialogPopup open={importOpen} setOpen={(open) => !importing && setImportOpen(open)} heading="Import from Tally"
        subheading="All Tally vouchers in this date range will be added as transactions. Ones already in the app are skipped."
        showButtons successbtntxt="Import" onConfirm={handleImport} isConfirming={importing}
        confirmDisabled={!importRange?.startDate || !importRange?.endDate} maxWidth="720px">
        {importRange && (
          <div className="flex justify-center">
            <CustomDatePicker value={importRange} onChange={setImportRange} maxDate={maxSelectableDate} />
          </div>
        )}
      </DialogPopup>
      <DialogPopup open={ledgerOpen} setOpen={setLedgerOpen} heading="Add Ledger"
        showButtons successbtntxt="Add Ledger" onConfirm={handleCreateLedger} isConfirming={savingLedger}
        confirmDisabled={loadingGroups || !ledgerDraft.name.trim() || !ledgerDraft.parent}>
        <div className="space-y-4">
          <CustomInput id="ledger-name" labelText="Ledger" value={ledgerDraft.name}
            onChange={(name) => setLedgerDraft((current) => ({ ...current, name }))} />
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Under Group</p>
            <RowDropDown value={ledgerDraft.parent} options={groups.filter((group) => group.name).map((group) => group.name)}
              placeholder={loadingGroups ? "Loading groups..." : "Select group"} showSearch disabled={loadingGroups}
              onValueChange={(parent) => setLedgerDraft((current) => ({ ...current, parent }))} />
          </div>
          <CustomInput id="opening-balance" labelText="Opening Balance (optional)" type="number" step="0.01"
            value={ledgerDraft.openingBalance} onChange={(openingBalance) => setLedgerDraft((current) => ({ ...current, openingBalance }))} />
          {dialogError && <p className="text-sm text-red-600">{dialogError}</p>}
        </div>
      </DialogPopup>
      <DialogPopup open={confirmPushOpen} setOpen={(open) => !pushing && setConfirmPushOpen(open)}
        heading="Push to Tally?"
        subheading="Vouchers will be created in Tally for these transactions. This can't be undone from here."
        showButtons successbtntxt={`Push ${selectedReady.length} to Tally`} onConfirm={handlePush} isConfirming={pushing}
        confirmDisabled={!selectedReady.length || selectedReady.length !== selectedRows.length}>
        <div className="space-y-1 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <p><span className="font-semibold">Transactions:</span> {selectedReady.length}</p>
          <p><span className="font-semibold">Total amount:</span> {formatINR(selectedReady.reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0))}</p>
          <p><span className="font-semibold">Company:</span> {[...new Set(selectedReady.map((row) => row.company))].join(", ") || "-"}</p>
        </div>
      </DialogPopup>
      <EditTransactionDialog open={Boolean(editTarget)} setOpen={(open) => !open && setEditTarget(null)} data={editTarget} />
    </div>
  );
};

export default TallyView;
