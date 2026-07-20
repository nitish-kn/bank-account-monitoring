import { Table } from "@radix-ui/themes";
import { ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";

const CustomTableHeader = ({ columns = [], sort, onSort }) => {
  return (
    <Table.Header>
      <Table.Row className="bg-blue-50">
        {columns.map((column) => {
          const isSortable = column.sortable;
          const sortKey = column.sortKey || column.key;
          const isSorted = sort && sort.field === sortKey;
          const isAsc = sort && sort.order === "asc";

          return (
            <Table.ColumnHeaderCell
              key={column.key}
              style={column.columnWidth ? { width: column.columnWidth } : undefined}
              className={`
                sticky top-0 z-10 border-b border-gray-200 bg-gray-50
                px-4 py-3 text-xs font-bold uppercase tracking-wide 
                ${column.width || ""}
                ${column.headerClassName || ""}
              `}
            >
              {isSortable ? (
                <div
                  className="flex min-w-0 items-center gap-1.5 cursor-pointer select-none"
                  onClick={() => onSort && onSort(sortKey)}
                >
                  <span className="truncate">{column.header}</span>
                  {isSorted ? (
                    isAsc ? (
                      <ChevronUp className="h-3.5 w-3.5 text-blue-600" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-blue-600" />
                    )
                  ) : (
                    <ArrowUpDown className="h-3.5 w-3.5 text-gray-400 opacity-40 hover:opacity-100" />
                  )}
                </div>
              ) : (
                column.header
              )}
            </Table.ColumnHeaderCell>
          );
        })}
      </Table.Row>
    </Table.Header>
  );
};

export default CustomTableHeader;
