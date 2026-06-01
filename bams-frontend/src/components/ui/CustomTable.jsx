import { Table } from "@radix-ui/themes";
import CustomTableHeader from "./CustomTableHeader";
import CustomTableRow from "./CustomTableRow";

const CustomTable = ({
  columns = [],
  data = [],
  minWidth = "900px",
  size = "2",
  variant = "surface",
  getRowKey,
  emptyMessage = "No data found",
}) => {
  return (
    <Table.Root size={size} variant={variant} style={{ minWidth }}>
      <CustomTableHeader columns={columns} />

      <Table.Body>
        {data.length === 0 ? (
          <Table.Row>
            <Table.Cell colSpan={columns.length} className="px-6 py-10 text-center">
              <p className="text-sm font-medium text-gray-400">
                {emptyMessage}
              </p>
            </Table.Cell>
          </Table.Row>
        ) : (
          data.map((row, rowIndex) => (
            <CustomTableRow
              key={getRowKey ? getRowKey(row, rowIndex) : row.id || rowIndex}
              row={row}
              rowIndex={rowIndex}
              columns={columns}
              getRowKey={getRowKey}
            />
          ))
        )}
      </Table.Body>
    </Table.Root>
  );
};

export default CustomTable;