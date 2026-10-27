import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import CustomTable from "../../components/ui/CustomTable";
import CustomDropDown from "../../components/ui/CustomDropDown";
import { formatINR } from "../../lib/helper";
import { tallyApi } from "../../api/tally";
import ReportShell from "./ReportShell";
import useTallyReport from "./useTallyReport";
import { balanceText, drCr, money, voucherTypeName } from "./format";

const amountColumn = (key, header, render = (row) => money(row[key])) => ({
  key,
  header,
  headerAlign: "right",
  render: (row) => <span className="ml-auto text-sm text-gray-800">{render(row)}</span>,
});

const columns = [
  { key: "date", header: "Date", columnWidth: "120px" },
  { key: "particulars", header: "Particulars" },
  { key: "voucherType", header: "Voucher Type", columnWidth: "130px", render: (row) => voucherTypeName(row.voucherType) },
  amountColumn("debit", "Debit"),
  amountColumn("credit", "Credit"),
  amountColumn("balance", "Balance", (row) => (row.balance === null ? "-" : drCr(row.balance))),
];

const Summary = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs font-semibold uppercase text-gray-500">{label}</span>
    <span className="text-sm font-semibold text-gray-900">{value}</span>
  </div>
);

const StatementOfAccounts = () => {
  const [ledger, setLedger] = useState("");
  const [ledgers, setLedgers] = useState(null); // null until the dropdown is first opened
  const [loadingLedgers, setLoadingLedgers] = useState(false);
  const report = useTallyReport(
    "Statement of Accounts",
    (range, company, options) => tallyApi.getLedgerStatement(ledger, range, company, options),
    { enabled: Boolean(ledger), key: ledger },
  );
  const { company } = report;

  // Ledgers belong to a company, so forget them (and the pick) whenever the company changes.
  const companyRef = useRef(company);
  companyRef.current = company;
  useEffect(() => {
    setLedger("");
    setLedgers(null);
  }, [company]);

  // The ledger list is a heavy request to Tally, so it is only fetched when the dropdown is first opened.
  const loadLedgers = (open) => {
    if (!open || ledgers || loadingLedgers || !company) return;
    const forCompany = company;
    setLoadingLedgers(true);
    tallyApi.getReportLedgers(forCompany)
      .then(({ ledgers: list }) => companyRef.current === forCompany && setLedgers(list.map((l) => l.name)))
      .catch((err) => toast.error(err.response?.data?.detail || err.message || "Failed to load ledgers."))
      .finally(() => setLoadingLedgers(false));
  };

  return (
    <ReportShell
      title="Statement of Accounts"
      report={report}
      idleMessage="Select a ledger to view its statement."
      showEmpty
      filters={(
        <div className="w-56">
          <CustomDropDown
            options={ledgers || []}
            value={ledger}
            onValueChange={setLedger}
            onOpenChange={loadLedgers}
            emptyMessage={loadingLedgers ? "Loading ledgers..." : "No ledgers found"}
            placeholder="Select ledger"
            disabled={!company}
            showSearch
            searchPlaceholder="Search ledgers..."
            buttonVariant="outline"
            buttonColor="gray"
            buttonSize="2"
            triggerClassName="w-full! justify-between! text-gray-800!"
            matchTriggerWidth
            align="start"
          />
        </div>
      )}
    >
      {(rows, data) => (
        <>
          <div className="flex flex-wrap gap-x-10 gap-y-3 border-b border-gray-200 bg-blue-50 px-4 py-3">
            <Summary label="Opening Balance" value={balanceText(data.openingBalance)} />
            <Summary label="Total Debit" value={formatINR(data.totalDebit)} />
            <Summary label="Total Credit" value={formatINR(data.totalCredit)} />
            <Summary label="Closing Balance" value={balanceText(data.closingBalance)} />
          </div>
          {data.unlisted !== 0 && (
            <p className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
              Tally's transaction list for this ledger is {formatINR(Math.abs(data.unlisted))} short of its closing balance, so some vouchers are missing here. The opening and closing balances are Tally's own.
            </p>
          )}
          <div className="overflow-x-auto">
            <CustomTable columns={columns} data={rows} minWidth="800px" emptyMessage="No transactions for this ledger in this period." />
          </div>
        </>
      )}
    </ReportShell>
  );
};

export default StatementOfAccounts;
