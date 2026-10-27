import CustomAccordion from "../../components/ui/CustomAccordion";
import { drCr } from "./format";

const Amount = ({ amount, className }) => (
  <span className={`ml-auto pl-4 whitespace-nowrap ${className}`}>{drCr(amount)}</span>
);

// Balance Sheet / P&L: each group row becomes an accordion item holding the rows up to the next group.
const toAccordionItems = (rows) => {
  const items = [];
  rows.forEach((row, i) => {
    if (row.isGroup || !items.length) {
      items.push({
        id: i,
        title: <span className="text-sm font-semibold text-gray-900">{row.name}</span>,
        right: <Amount amount={row.amount} className="text-sm font-semibold text-gray-900" />,
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
        <Amount amount={child.amount} className="text-gray-700" />
      </div>
    )) : undefined,
  }));
};

// The shell unmounts this while a new company/date range loads, so the first group opens again each time.
const StatementAccordion = ({ rows }) => (
  <>
    <div className="flex items-center justify-between border-b border-gray-200 bg-blue-50 px-4 py-3 pl-10 text-xs font-semibold uppercase text-gray-800">
      <span>Particulars</span>
      <span>Amount</span>
    </div>
    <CustomAccordion items={toAccordionItems(rows)} defaultOpenIds={[0]} />
  </>
);

export default StatementAccordion;
