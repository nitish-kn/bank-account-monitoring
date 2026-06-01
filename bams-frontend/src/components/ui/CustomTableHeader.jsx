import { Table } from "@radix-ui/themes";

const CustomTableHeader = ({ columns = [] }) => {
  return (
    <Table.Header>
      <Table.Row className="bg-blue-50">
        {columns.map((column) => (
          <Table.ColumnHeaderCell
            key={column.key}
            className={`
              sticky top-0 z-10 border-b border-gray-200 bg-gray-50
              px-4 py-3 text-xs font-bold uppercase tracking-wide 
              ${column.width || ""}
              ${column.headerClassName || ""}
            `}
          >
            {column.header}
          </Table.ColumnHeaderCell>
        ))}
      </Table.Row>
    </Table.Header>
  );
};

export default CustomTableHeader;