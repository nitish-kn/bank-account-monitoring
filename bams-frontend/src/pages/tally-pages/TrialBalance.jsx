import CustomAccordion from "../../components/ui/CustomAccordion";
import { formatINR } from "../../lib/helper";
import { tallyApi } from "../../api/tally";
import ReportShell from "./ReportShell";
import useTallyReport from "./useTallyReport";
import { money } from "./format";

const COLUMNS = "w-36 shrink-0 text-right whitespace-nowrap";

const Amounts = ({ debit, credit, className }) => (
  <span className={`ml-auto flex ${className}`}>
    <span className={COLUMNS}>{money(debit)}</span>
    <span className={COLUMNS}>{money(credit)}</span>
  </span>
);

// Each primary group is an accordion item holding the rows listed under it.
const toAccordionItems = (rows) => {
  const items = [];
  rows.forEach((row, i) => {
    if (row.isGroup || !items.length) {
      items.push({
        id: i,
        title: <span className="text-sm font-semibold text-gray-900">{row.name}</span>,
        right: <Amounts debit={row.debit} credit={row.credit} className="text-sm font-semibold text-gray-900" />,
        rows: [],
      });
    } else {
      items[items.length - 1].rows.push(row);
    }
  });
  return items.map(({ rows: children, ...item }) => ({
    ...item,
    children: children.length ? children.map((child, j) => (
      <div key={j} className="flex items-center py-2.5 pl-11 pr-4 text-sm text-gray-700">
        <span className="min-w-0 truncate">{child.name}</span>
        <Amounts debit={child.debit} credit={child.credit} className="text-gray-700" />
      </div>
    )) : undefined,
  }));
};

const TrialBalance = () => {
  const report = useTallyReport("Trial Balance", (range, company, options) => tallyApi.getReport("trial-balance", range, company, options));
  return (
    <ReportShell title="Trial Balance" asOn report={report}>
      {(rows, { totalDebit, totalCredit }) => {
        const difference = Math.round((totalDebit - totalCredit) * 100) / 100;
        return (
          <>
            <div className="flex items-center border-b border-gray-200 bg-blue-50 px-4 py-3 pl-10 text-xs font-semibold uppercase text-gray-800">
              <span>Particulars</span>
              <span className="ml-auto flex">
                <span className={COLUMNS}>Debit</span>
                <span className={COLUMNS}>Credit</span>
              </span>
            </div>
            <CustomAccordion items={toAccordionItems(rows)} defaultOpenIds={[0]} />
            <div className="flex items-center border-t border-gray-200 bg-gray-50 px-4 py-3 pl-10 text-sm font-semibold text-gray-900">
              <span>Total</span>
              <Amounts debit={totalDebit} credit={totalCredit} className="" />
            </div>
            {difference !== 0 && (
              <p className="border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
                Debit and credit totals differ by {formatINR(Math.abs(difference))}
                {difference > 0 ? " (debit higher)" : " (credit higher)"}, often a difference in opening balances.
              </p>
            )}
          </>
        );
      }}
    </ReportShell>
  );
};

export default TrialBalance;
