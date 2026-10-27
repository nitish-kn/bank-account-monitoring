import ReportShell from "./ReportShell";
import StatementAccordion from "./StatementAccordion";
import { tallyApi } from "../../api/tally";
import useTallyReport from "./useTallyReport";

const ProfitLoss = () => {
  const report = useTallyReport("Profit & Loss", (range, company, options) => tallyApi.getReport("profit-loss", range, company, options));
  return (
    <ReportShell title="Profit & Loss" report={report}>
      {(rows) => <StatementAccordion rows={rows} />}
    </ReportShell>
  );
};

export default ProfitLoss;
