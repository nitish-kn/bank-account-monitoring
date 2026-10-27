import CustomTable from "../../components/ui/CustomTable";
import { tallyApi } from "../../api/tally";
import ReportShell from "./ReportShell";
import useTallyReport from "./useTallyReport";
import { money } from "./format";

const amountColumn = (key, header, className = () => "text-gray-800") => ({
  key,
  header,
  headerAlign: "right",
  render: (row) => <span className={`ml-auto text-sm ${className(row)}`}>{money(row[key])}</span>,
});

const columns = [
  { key: "period", header: "Month" },
  amountColumn("debit", "Debit"),
  amountColumn("credit", "Credit"),
  amountColumn("net", "Net Change", (row) => `font-semibold ${row.net < 0 ? "text-red-600" : "text-gray-900"}`),
];

const FundsFlow = () => {
  const report = useTallyReport("Funds Flow", (range, company, options) => tallyApi.getReport("funds-flow", range, company, options));
  return (
    <ReportShell title="Funds Flow" report={report}>
      {(rows) => (
        <div className="overflow-x-auto">
          <CustomTable columns={columns} data={rows} minWidth="700px" />
        </div>
      )}
    </ReportShell>
  );
};

export default FundsFlow;
