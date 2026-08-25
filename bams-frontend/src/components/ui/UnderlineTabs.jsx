/**
 * Simple underline tab bar with an optional count badge per tab, e.g.
 * "All (16)". Deliberately not Radix Tabs.Root -- this is just a row of
 * buttons driving external filter state, no panel-switching semantics needed.
 */
const UnderlineTabs = ({ tabs = [], value, onChange, className = "" }) => {
  return (
    <div className={`flex items-center gap-6 border-b border-gray-200 ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange?.(tab.value)}
            className={`relative -mb-px flex items-center gap-1.5 pb-3 text-sm font-semibold transition ${
              isActive ? "text-blue-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={isActive ? "text-blue-600" : "text-gray-400"}>({tab.count})</span>
            )}
            {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-600" />}
          </button>
        );
      })}
    </div>
  );
};

export default UnderlineTabs;
