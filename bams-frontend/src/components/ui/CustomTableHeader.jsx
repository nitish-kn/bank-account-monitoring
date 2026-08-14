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
          const alignClass = column.headerAlign === "right"
            ? "items-end text-right"
            : column.headerAlign === "center"
              ? "items-center text-center"
              : "items-start text-left";
          const labelRowAlignClass = column.headerAlign === "right"
            ? "justify-end"
            : column.headerAlign === "center"
              ? "justify-center"
              : "justify-start";
          const sortIcon = isSorted
            ? (
              isAsc
                ? <ChevronUp className="h-3.5 w-3.5 text-blue-600" />
                : <ChevronDown className="h-3.5 w-3.5 text-blue-600" />
            )
            : <ArrowUpDown className="h-3.5 w-3.5 text-gray-400 opacity-40 hover:opacity-100" />;
          const headerSubtext = column.headerSubtext ? (
            <span className={`block truncate text-sm font-semibold normal-case tracking-normal text-slate-700 ${column.headerSubtextClassName || ""}`}>
              {column.headerSubtext}
            </span>
          ) : null;

          return (
            <Table.ColumnHeaderCell
              key={column.key}
              style={column.columnWidth ? { width: column.columnWidth } : undefined}
              className={`
                sticky top-0 z-10 border-b border-gray-200 bg-gray-50
                px-4 py-3 align-middle text-xs font-bold uppercase tracking-wide 
                ${column.width || ""}
                ${column.headerClassName || ""}
              `}
            >
              {isSortable ? (
                <div
                  className={`flex min-h-10 min-w-0 cursor-pointer select-none flex-col justify-center gap-1 ${alignClass}`}
                  onClick={() => onSort && onSort(sortKey)}
                >
                  <div className={`flex min-w-0 items-center gap-2 ${labelRowAlignClass}`}>
                    
                    <div className="min-w-0 truncate space-y-1">
                      {column.header}
                      {headerSubtext}
                    </div>
                    
                    {sortIcon}
                  </div>
              
                </div>
              ) : (
                <div className={`flex min-h-10 min-w-0 flex-col justify-center gap-1 ${alignClass}`}>
                  <span className="truncate">{column.header}</span>
                  {headerSubtext}
                </div>
              )}
            </Table.ColumnHeaderCell>
          );
        })}
      </Table.Row>
    </Table.Header>
  );
};

export default CustomTableHeader;
