import React from "react";
import { Table } from "@radix-ui/themes";

const defaultFieldLabels = {
  category: "Category",
  narration: "Narration",
  counterparty: "Counterparty",
  account_number: "Account Number",
  account_holder_name: "Account Holder Name",
  txn_date: "Transaction Date",
  mode: "Mode",
  ref_number: "Reference ID",
  amount: "Amount",
  txn_type: "Transaction Type",
};

const formatFieldLabel = (field, fieldLabels) => {
  return fieldLabels[field] || String(field || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const formatChangeValue = (value) => {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const AuditChangesTable = ({ changes, fieldLabels = defaultFieldLabels }) => {
  const entries = Object.entries(changes || {});

  if (!entries.length) {
    return (
      <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500">
        No field changes recorded.
      </div>
    );
  }

  return (
    <Table.Root variant="surface" className="w-full text-left text-xs border border-gray-100 rounded-lg overflow-hidden">
      <Table.Header className="bg-blue-50 text-gray-600 font-bold text-xs">
        <Table.Row>
          <Table.ColumnHeaderCell className="p-2.5 w-1/3">FIELD</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell className="p-2.5 w-1/3">BEFORE</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell className="p-2.5 w-1/3">AFTER</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>

      <Table.Body className="divide-y divide-gray-100">
        {entries.map(([field, val]) => {
          const before = formatChangeValue(val?.old);
          const after = formatChangeValue(val?.new);

          return (
            <Table.Row key={field} align="center" className="hover:bg-slate-50/20">
              <Table.Cell className="p-2.5 align-middle font-bold text-gray-800">
                {formatFieldLabel(field, fieldLabels)}
              </Table.Cell>

              <Table.Cell className="p-2.5 align-middle">
                <span className="inline-block max-w-[18rem] truncate rounded-md border border-red-100/50 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700" title={before}>
                  {before}
                </span>
              </Table.Cell>

              <Table.Cell className="p-2.5 align-middle">
                <span className="inline-block max-w-[18rem] truncate rounded-md border border-green-100/50 bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700" title={after}>
                  {after}
                </span>
              </Table.Cell>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table.Root>
  );
};

export default AuditChangesTable;
