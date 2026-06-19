import { ChevronLeft, ChevronRight } from "lucide-react";
import CustomButton from "./ui/CustomButton";
import CustomSelect from "./ui/CustomSelect";

const DOTS = "dots";

const range = (start, end) => {
  const length = end - start + 1;
  return Array.from({ length }, (_, index) => index + start);
};

const getPaginationItems = ({ currentPage, totalPages, siblingCount = 1 }) => {
  const totalPageSlots = siblingCount + 5;

  if (totalPageSlots >= totalPages) {
    return range(1, totalPages);
  }

  const leftSibling = Math.max(currentPage - siblingCount, 1);
  const rightSibling = Math.min(currentPage + siblingCount, totalPages);
  const showLeftDots = leftSibling > 2;
  const showRightDots = rightSibling < totalPages - 1;

  if (!showLeftDots && showRightDots) {
    const leftRange = range(1, 3 + siblingCount * 2);
    return [...leftRange, DOTS, totalPages];
  }

  if (showLeftDots && !showRightDots) {
    const rightRange = range(totalPages - (2 + siblingCount * 2), totalPages);
    return [1, DOTS, ...rightRange];
  }

  const middleRange = range(leftSibling, rightSibling);
  return [1, DOTS, ...middleRange, DOTS, totalPages];
};

const PaginationButton = ({ children, active = false, disabled = false, onClick, label }) => {
  return (
    <CustomButton
      aria-label={label}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      color={active ? "blue" : "gray"}
      variant={active ? "solid" : "outline"}
      onClick={onClick}
      // className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50`}
    >
      {children}
    </CustomButton>
  );
};

const Pagination = ({
  currentPage = 1,
  totalItems = 0,
  pageSize = 10,
  pageSizeOptions = [10, 20, 30, 50],
  itemLabel = "items",
  siblingCount = 1,
  showPageSize = true,
  onPageChange,
  onPageSizeChange,
  className = "",
}) => {
  const safePageSize = Math.max(Number(pageSize) || 10, 1);
  const totalPages = Math.max(Math.ceil(totalItems / safePageSize), 1);
  const safeCurrentPage = Math.min(Math.max(Number(currentPage) || 1, 1), totalPages);
  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * safePageSize + 1;
  const endItem = Math.min(safeCurrentPage * safePageSize, totalItems);
  const paginationItems = getPaginationItems({
    currentPage: safeCurrentPage,
    totalPages,
    siblingCount,
  });

  if (totalItems === 0) {
    return null;
  }

  return (
    <div className={`flex flex-col gap-4 sm:gap-3 border-t border-gray-100 w-full py-4 px-2 md:px-5 md:flex-row md:items-center md:justify-between ${className}`}
    >
      <div className="flex gap-2 text-sm text-gray-500 sm:items-center">
        <span>
          Showing <span className="font-semibold text-gray-700">{startItem}</span>-
          <span className="font-semibold text-gray-700">{endItem}</span> of{" "}
          <span className="font-semibold text-gray-700">{totalItems}</span> {itemLabel}
        </span>

        {showPageSize && onPageSizeChange ? (
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <span>Rows</span>
            <CustomSelect
              value={safePageSize}
              options={pageSizeOptions}
              multiple={false}
              onValueChange={(nextValue) => onPageSizeChange(Number(nextValue))}
              showSearch={false}
              triggerClassName="p-2! space-x-1 min-w-16 text-sm"
              contentClassName="min-w-16"
            />
          </div>
        ) : null}
      </div>

      <nav className="flex items-center justify-center gap-1" aria-label="Pagination">
        <PaginationButton
          label="Previous page"
          disabled={safeCurrentPage === 1}
          onClick={() => onPageChange?.(safeCurrentPage - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </PaginationButton>

        {paginationItems.map((item, index) =>
          item === DOTS ? (
            <span
              key={`${item}-${index}`}
              className="inline-flex h-8 min-w-8 items-center justify-center text-sm text-gray-400"
            >
              ...
            </span>
          ) : (
            <PaginationButton
              key={item}
              label={`Page ${item}`}
              active={item === safeCurrentPage}
              onClick={() => onPageChange?.(item)}
            >
              {item}
            </PaginationButton>
          ),
        )}

        <PaginationButton
          label="Next page"
          disabled={safeCurrentPage === totalPages}
          onClick={() => onPageChange?.(safeCurrentPage + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </PaginationButton>
      </nav>
    </div>
  );
};

export default Pagination;
