const ChartCard = ({ id, title, action, children, className = "" }) => {
  return (
    <div
      id={id}
      style={{ minWidth: 0, minHeight: 0 }}
      className={`flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-md ${className}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </div>
  );
};

export default ChartCard;
