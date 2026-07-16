import { Table } from "@radix-ui/themes";
import { Triangle } from "lucide-react";

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
            <span className="flex items-center">
              {column.header}

              {(column?.key !== "source_name" && column?.key !== "actions") && 
              (
                <>
                  <Triangle className="h-2.5 w-2.5 border-0 ml-1 fill-gray-400 hover:fill-gray-600 transition-transform duration-200 hover:cursor-pointer" stroke="none"/>
                  <Triangle className="h-2.5 w-2.5 border-0 rotate-180 fill-gray-400 hover:fill-gray-600 transition-transform duration-200 hover:cursor-pointer" stroke="none"/>
                </>
              )}
            </span>
          </Table.ColumnHeaderCell>
        ))}
      </Table.Row>
    </Table.Header>
  );
};

export default CustomTableHeader;