const FilterField = ({ label, children, className = "" }) => {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-semibold text-gray-700">{label}</span>
      {children}
    </div>
  );
};

export default FilterField;
