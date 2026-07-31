import React from "react";
import { Table } from "@radix-ui/themes";
import CustomTableHeader from "./CustomTableHeader";
import CustomTableRow from "./CustomTableRow";

const CustomTable = ({
  columns = [],
  data = [],
  minWidth = "900px",
  tableLayout = "fixed",
  size = "2",
  variant = "surface",
  getRowKey,
  emptyMessage = "No data found",
  sort,
  onSort,
  renderRowDetails,
  isLoading = false,
  className = "",
}) => {
  return (
    <Table.Root
      size={size}
      variant={variant}
      layout={tableLayout}
      className={`[&_.rt-TableRootTable]:min-w-[var(--custom-table-min-width)] [&_.rt-TableRootTable]:w-full ${className}`}
      style={{ "--custom-table-min-width": minWidth, width: "100%" }}
    >
      <colgroup>
        {columns.map((column) => (
          <col
            key={column.key}
            style={column.columnWidth ? { width: column.columnWidth } : undefined}
          />
        ))}
      </colgroup>

      <CustomTableHeader columns={columns} sort={sort} onSort={onSort} />

      <Table.Body>
        {isLoading && data.length === 0 ? (
          <Table.Row>
            <Table.Cell colSpan={columns.length} className="px-6 py-10 text-center">
              <p className="text-sm font-medium text-gray-400 animate-pulse">
                Loading data...
              </p>
            </Table.Cell>
          </Table.Row>
        ) : data.length === 0 ? (
          <Table.Row>
            <Table.Cell colSpan={columns.length} className="px-6 py-10 text-center">
              <p className="text-sm font-medium text-gray-400">
                {emptyMessage}
              </p>
            </Table.Cell>
          </Table.Row>
        ) : (
          data.map((row, rowIndex) => {
            const rowKey = getRowKey ? getRowKey(row, rowIndex) : row.id || rowIndex;
            return (
              <React.Fragment key={rowKey}>
                <CustomTableRow
                  row={row}
                  rowIndex={rowIndex}
                  columns={columns}
                  getRowKey={getRowKey}
                />
                {renderRowDetails && renderRowDetails(row, rowIndex)}
              </React.Fragment>
            );
          })
        )}
      </Table.Body>
    </Table.Root>
  );
};

export default CustomTable;
