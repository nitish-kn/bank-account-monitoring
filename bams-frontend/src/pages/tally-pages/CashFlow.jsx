import CustomTable from "../../components/ui/CustomTable";
import { formatINR } from "../../lib/helper";
import ReportShell from "./ReportShell";
import { tallyApi } from "../../api/tally";
import useTallyReport from "./useTallyReport";

const amountColumn = (key, header, className = () => "text-gray-800") => ({
  key,
  header,
  headerAlign: "right",
  render: (row) => (
    <span className={`ml-auto text-sm ${className(row)}`}>{row[key] ? formatINR(row[key]) : "-"}</span>
  ),
});

const columns = [
  { key: "period", header: "Month" },
  amountColumn("inflow", "Inflow"),
  amountColumn("outflow", "Outflow"),
  amountColumn("net", "Net Flow", (row) => `font-semibold ${row.net < 0 ? "text-red-600" : "text-gray-900"}`),
];

const CashFlow = () => {
  const report = useTallyReport("Cash Flow", (range, company, options) => tallyApi.getReport("cash-flow", range, company, options));
  return (
    <ReportShell title="Cash Flow" report={report}>
      {(rows) => (
        <div className="overflow-x-auto">
          <CustomTable columns={columns} data={rows} minWidth="700px" />
        </div>
      )}
    </ReportShell>
  );
};

export default CashFlow;
