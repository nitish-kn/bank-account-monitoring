import CustomAccordion from "../../components/ui/CustomAccordion";
import { tallyApi } from "../../api/tally";
import ReportShell from "./ReportShell";
import useTallyReport from "./useTallyReport";

const SECTIONS = [
  { id: "ratio", title: "Key Ratios" },
  { id: "amount", title: "Balances" },
];

const toAccordionItems = (rows) =>
  SECTIONS.map(({ id, title }) => ({ id, title, rows: rows.filter((row) => row.kind === id) }))
    .filter((section) => section.rows.length)
    .map(({ id, title, rows: sectionRows }) => ({
      id,
      title: <span className="text-sm font-semibold text-gray-900">{title}</span>,
      children: sectionRows.map((row) => (
        <div key={row.name} className="flex items-center py-2.5 pl-11 pr-4 text-sm text-gray-700">
          <span className="min-w-0 truncate">{row.name}</span>
          <span className="ml-auto pl-4 whitespace-nowrap">{row.value}</span>
        </div>
      )),
    }));

const RatioAnalysis = () => {
  const report = useTallyReport("Ratio Analysis", (range, company, options) => tallyApi.getReport("ratio-analysis", range, company, options));
  return (
    <ReportShell title="Ratio Analysis" report={report}>
      {(rows) => {
        const items = toAccordionItems(rows);
        return (
          <>
            <div className="flex items-center justify-between border-b border-gray-200 bg-blue-50 px-4 py-3 pl-10 text-xs font-semibold uppercase text-gray-800">
              <span>Particulars</span>
              <span>Value</span>
            </div>
            <CustomAccordion items={items} defaultOpenIds={items.map((item) => item.id)} />
          </>
        );
      }}
    </ReportShell>
  );
};

export default RatioAnalysis;
