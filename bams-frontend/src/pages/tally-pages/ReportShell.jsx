import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronDown, RefreshCw } from "lucide-react";
import CustomButton from "../../components/ui/CustomButton";
import CustomDropDown from "../../components/ui/CustomDropDown";
import CustomDatePicker from "../../components/ui/CustomDatePicker";
import { formatTransactionDateRangeLabel } from "../../lib/transactional-helper";

const Message = ({ children, className = "" }) => (
  <p className={`px-6 py-10 text-center text-sm font-medium text-gray-400 ${className}`}>{children}</p>
);

// Page chrome shared by the Tally report pages: title, company + date filters (plus any page-specific
// `filters`), and the loading / error / empty states. `children(rows, data)` renders only when there
// are rows to show, or always with `showEmpty` (for pages that show more than the rows).
const ReportShell = ({ title, asOn, report, filters, idleMessage, showEmpty = false, children }) => {
  const { dateRange, setDateRange, companies, company, setCompany, data, loading, idle, error, reload } = report;
  const [openDateFilter, setOpenDateFilter] = useState(false);
  const dateFilterRef = useRef(null);
  const maxSelectableDate = useMemo(() => new Date(), []);
  const dateRangeLabel = useMemo(() => formatTransactionDateRangeLabel(dateRange), [dateRange]);
  const rows = data?.rows || [];

  useEffect(() => {
    if (!openDateFilter) return undefined;
    const handleOutsideClick = (event) => {
      if (dateFilterRef.current && !dateFilterRef.current.contains(event.target)) setOpenDateFilter(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [openDateFilter]);

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {asOn && <p className="text-xs font-medium text-gray-500">As on {dateRangeLabel.long.split(" - ")[1]}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-52">
            <CustomDropDown
              options={companies}
              value={company}
              onValueChange={setCompany}
              placeholder="Select company"
              disabled={!companies.length}
              showSearch
              searchPlaceholder="Search companies..."
              buttonVariant="outline"
              buttonColor="gray"
              buttonSize="2"
              triggerClassName="w-full! justify-between! text-gray-800!"
              matchTriggerWidth
              align="start"
            />
          </div>

          {filters}

          <div ref={dateFilterRef} className="relative">
            <CustomButton color="gray" variant="outline" size="2" className="text-gray-800!" onClick={() => setOpenDateFilter((prev) => !prev)}>
              <Calendar className="mr-1 h-4 w-4" />
              <span className="hidden sm:inline">{dateRangeLabel.long}</span>
              <span className="sm:hidden">{dateRangeLabel.short}</span>
              <ChevronDown className="ml-1 h-4 w-4" />
            </CustomButton>
            {openDateFilter && (
              <div className="absolute z-20 top-10 right-0">
                <CustomDatePicker value={dateRange} onChange={setDateRange} maxDate={maxSelectableDate} />
              </div>
            )}
          </div>

          <CustomButton color="gray" variant="outline" size="2" className="text-gray-800!" title="Reload from Tally" aria-label="Reload from Tally" disabled={loading || idle} onClick={reload}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </CustomButton>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {error ? (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600">
            {error} {error.includes("Configure") && "Set it up on the Tally View page."}
          </div>
        ) : !company && !loading ? (
          <Message>No company is open in Tally.</Message>
        ) : idle ? (
          <Message>{idleMessage}</Message>
        ) : loading ? (
          <Message className="animate-pulse">Loading data...</Message>
        ) : !data || (!rows.length && !showEmpty) ? (
          <Message>No {title} data in Tally for this period.</Message>
        ) : (
          children(rows, data)
        )}
      </div>
    </div>
  );
};

export default ReportShell;
