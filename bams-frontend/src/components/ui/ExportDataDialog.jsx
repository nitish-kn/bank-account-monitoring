import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Checkbox, Spinner } from "@radix-ui/themes";
import { File, FileSpreadsheet, FileText, ListFilter } from "lucide-react";
import { toast } from "react-toastify";
import DialogPopup from "./DialogPopup";
import CustomDropDown from "./CustomDropDown";
import CustomButton from "./CustomButton";
import { exportApi } from "../../api/export";
import { useExportContextStore } from "../../store/exportContextStore";
import { describeExportFilters, DATE_LABEL_BY_SOURCE } from "../../lib/export-helper";

// Maps a route to the export source that page's table actually corresponds
// to server-side, so the dialog can default to "the page they're on".
// Pages with no exportable table (Dashboard, Chat Assistant) fall back to
// the first available source once sources load.
const PAGE_TO_SOURCE = {
  "/transactions": "transactions",
  "/all-accounts": "accounts",
  "/audit-log": "audit-log",
};

const FORMAT_OPTIONS = [
  { key: "csv", label: "CSV", icon: FileText },
  { key: "xlsx", label: "Excel", icon: FileSpreadsheet },
  { key: "pdf", label: "PDF", icon: File },
];

const defaultColumnKeys = (columns = []) => columns.filter((col) => col.default).map((col) => col.key);

const ExportDataDialog = ({ open, setOpen }) => {
  const pathname = useLocation().pathname;
  const exportContextBySource = useExportContextStore((state) => state.bySource);

  const [sources, setSources] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesError, setSourcesError] = useState("");
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [selectedFormat, setSelectedFormat] = useState("csv");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    let isCancelled = false;
    setSourcesLoading(true);
    setSourcesError("");

    exportApi
      .getSources()
      .then((result) => {
        if (isCancelled) return;
        const list = result.sources || [];
        setSources(list);

        const defaultSourceKey = PAGE_TO_SOURCE[pathname];
        const initialSource = list.find((item) => item.key === defaultSourceKey) || list[0];
        setSelectedSource(initialSource?.key || null);
        setSelectedColumns(defaultColumnKeys(initialSource?.columns));
      })
      .catch((err) => {
        if (!isCancelled) {
          setSourcesError(err.response?.data?.detail || err.message || "Failed to load export options.");
        }
      })
      .finally(() => {
        if (!isCancelled) setSourcesLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [open, pathname]);

  const sourceOptions = useMemo(
    () => sources.map((item) => ({ label: item.label, value: item.key })),
    [sources],
  );

  const activeSource = useMemo(
    () => sources.find((item) => item.key === selectedSource) || null,
    [sources, selectedSource],
  );
  const activeColumns = activeSource?.columns || [];

  const handleSelectSource = (value) => {
    setSelectedSource(value);
    const source = sources.find((item) => item.key === value);
    setSelectedColumns(defaultColumnKeys(source?.columns));
  };

  const toggleColumn = (key, checked) => {
    setSelectedColumns((current) =>
      checked ? [...current, key] : current.filter((col) => col !== key),
    );
  };

  const resetColumnsToDefault = () => setSelectedColumns(defaultColumnKeys(activeColumns));
  const selectAllColumns = () => setSelectedColumns(activeColumns.map((col) => col.key));

  const activeContext = exportContextBySource[selectedSource] || {};
  const { dateLine, filterLines } = useMemo(
    () => describeExportFilters(selectedSource, activeContext.filters || {}),
    [selectedSource, activeContext],
  );
  const dateLabel = DATE_LABEL_BY_SOURCE[selectedSource] || "Date";

  const handleExport = async () => {
    if (!selectedSource) return;
    setDownloading(true);
    try {
      await exportApi.download(selectedSource, selectedFormat, {
        columns: selectedColumns,
        filters: activeContext.filters || {},
      });
      toast.success("Your export has downloaded successfully.");
      setOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || "Failed to export data.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <DialogPopup
      open={open}
      setOpen={setOpen}
      heading="Export Data"
      subheading="Choose a page, its columns, and a file format to download a report."
      showButtons={false}
      maxWidth="520px"
    >
      <div className="flex flex-col gap-5 mt-2">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Page</p>
          <CustomDropDown
            options={sourceOptions}
            value={selectedSource}
            onValueChange={handleSelectSource}
            placeholder={sourcesLoading ? "Loading..." : "Select a page"}
            disabled={sourcesLoading || sourceOptions.length === 0}
            buttonVariant="outline"
            buttonColor="gray"
            triggerClassName="w-full! justify-between! h-9! text-sm!"
            matchTriggerWidth
            align="start"
          />
          {sourcesError && (
            <p className="text-xs font-semibold text-red-600">{sourcesError}</p>
          )}
        </div>

        {(dateLine || filterLines.length > 0) && (
          <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5">
            <ListFilter className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
            <div className="text-xs text-blue-800">
              <p className="font-semibold">Applied on this page - will be reflected in the export</p>
              <ul className="mt-1 space-y-0.5">
                {dateLine && <li>{dateLabel}: {dateLine}</li>}
                {filterLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Columns</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={selectAllColumns}
                className="text-xs font-semibold text-gray-500 hover:text-gray-700"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={resetColumnsToDefault}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Reset to default
              </button>
            </div>
          </div>

          <div className="grid max-h-48 grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto rounded-lg border border-gray-200 p-3">
            {activeColumns.length === 0 && (
              <p className="col-span-2 text-xs font-medium text-gray-400">
                {sourcesLoading ? "Loading columns..." : "Select a page to see its columns."}
              </p>
            )}
            {activeColumns.map((col) => (
              <label key={col.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <Checkbox
                  checked={selectedColumns.includes(col.key)}
                  onCheckedChange={(checked) => toggleColumn(col.key, checked === true)}
                />
                {col.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Format</p>
          <div className="grid grid-cols-3 gap-2">
            {FORMAT_OPTIONS.map(({ key, label, icon: Icon }) => {
              const isActive = selectedFormat === key;
              return (
                <CustomButton
                  key={key}
                  variant={isActive ? "solid" : "outline"}
                  color={isActive ? "blue" : "gray"}
                  onClick={() => setSelectedFormat(key)}
                  className="justify-center! gap-1.5!"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </CustomButton>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 mt-2 justify-end">
          <CustomButton variant="soft" color="gray" onClick={() => setOpen(false)} disabled={downloading}>
            Cancel
          </CustomButton>
          <CustomButton onClick={handleExport} disabled={!selectedSource || selectedColumns.length === 0 || downloading}>
            {downloading ? (
              <span className="flex items-center gap-2">
                <Spinner size="1" /> Exporting...
              </span>
            ) : (
              "Export"
            )}
          </CustomButton>
        </div>
      </div>
    </DialogPopup>
  );
};

export default ExportDataDialog;
