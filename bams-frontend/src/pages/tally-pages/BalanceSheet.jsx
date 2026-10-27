import ReportShell from "./ReportShell";
import StatementAccordion from "./StatementAccordion";
import { tallyApi } from "../../api/tally";
import useTallyReport from "./useTallyReport";

const BalanceSheet = () => {
  const report = useTallyReport("Balance Sheet", (range, company, options) => tallyApi.getReport("balance-sheet", range, company, options));
  return (
    <ReportShell title="Balance Sheet" asOn report={report}>
      {(rows) => <StatementAccordion rows={rows} />}
    </ReportShell>
  );
};

export default BalanceSheet;
