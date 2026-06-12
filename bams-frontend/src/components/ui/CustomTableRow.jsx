import { Table } from "@radix-ui/themes";

const CustomTableCell = ({
  children,
  className = "",
  title,
  width,
  align = "center",
}) => {
  const itemsClass = align === "top" ? "items-start" : align === "bottom" ? "items-end" : "items-center";

  return (
    <Table.Cell className={`p-4 ${width || ""} ${className}`} title={title}>
      <div className={`flex ${itemsClass} h-full`}>{children}</div>
    </Table.Cell>
  );
};


const CustomTableRow = ({ row, columns = [], rowIndex, getRowKey }) => {
  return (
    <Table.Row
      key={getRowKey ? getRowKey(row, rowIndex) : row.id || rowIndex}
      className="group border-b border-gray-100 transition-colors hover:bg-blue-50/40"
    >
      {columns.map((column) => {
        const rawValue = row[column.key];

        return (
          <CustomTableCell
            key={column.key}
            width={column.width}
            className={column.cellClassName}
            title={
              typeof rawValue === "string" || typeof rawValue === "number"
                ? String(rawValue)
                : undefined
            }
          >
            {column.render ? column.render(row, rowIndex) : rawValue || column.fallback || "-"}
          </CustomTableCell>
        );
      })}
    </Table.Row>
  );
};

export default CustomTableRow;