import { useState } from "react";
import { ChevronRight } from "lucide-react";

// items: [{ id, title, right?, children? }]. An item without `children` is a plain, non-expandable row.
// Uncontrolled: `defaultOpenIds` only sets the initial state (remount with a `key` to reset it).
const CustomAccordion = ({ items = [], defaultOpenIds = [], className = "" }) => {
  const [openIds, setOpenIds] = useState(() => new Set(defaultOpenIds));

  const toggle = (id) => setOpenIds((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  return (
    <div className={`divide-y divide-gray-100 ${className}`}>
      {items.map(({ id, title, right, children }) => {
        const expandable = Boolean(children);
        const open = expandable && openIds.has(id);
        return (
          <div key={id}>
            <button
              type="button"
              disabled={!expandable}
              aria-expanded={expandable ? open : undefined}
              onClick={() => toggle(id)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors enabled:cursor-pointer enabled:hover:bg-blue-50/40"
            >
              <ChevronRight className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${expandable ? "" : "invisible"} ${open ? "rotate-90" : ""}`} />
              <span className="min-w-0 flex-1 truncate">{title}</span>
              {right}
            </button>
            {open && <div className="bg-gray-50/90">{children}</div>}
          </div>
        );
      })}
    </div>
  );
};

export default CustomAccordion;
