import { colorClasses } from "../../utils/constants";

const indicatorClasses = {
  green: "bg-green-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  orange: "bg-orange-500",
  gray: "bg-gray-500",
  purple: "bg-purple-500",
  amber: "bg-amber-500",
};

const DataCard = ({
  title,
  value,
  icon: Icon,
  color = "blue",
  description,
  compact = false,
  indicatorColor,
  className = "",
}) => {
  const classes = colorClasses[color] || colorClasses.gray;

  if (compact) {
    return (
      <div className={`min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md ${className}`}>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            {indicatorColor ? (
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${indicatorClasses[indicatorColor] || indicatorClasses.gray}`} />
            ) : null}
            <p className="truncate text-xs font-medium text-slate-700">{title}</p>
          </div>
          <p className={`truncate text-2xl font-bold leading-tight ${classes?.value}`}>
            {value ?? "-"}
          </p>
          <p className="truncate text-xs text-slate-400">{description}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-w-62.5 flex-1 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md ${className}`}>
      <div className="flex items-center gap-4">
        
        {/* Icon Container */}
        {Icon ? (
          <div className={`flex h-12 w-12 items-center justify-center rounded-full ${classes.bg}`} >
            <Icon className={`h-6 w-6 ${classes.icon}`} />
          </div>
        ) : null}

        {/* Data Container */}
        <div className="min-w-0 flex gap-1.5 flex-col">
          <p className="text-sm font-medium text-shadow-sm text-gray-800">{title}</p>
          <p className={`text-2xl font-bold ${classes?.value}`}>
            {value ?? "-"}
          </p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
    </div>
  );
};

export default DataCard;
