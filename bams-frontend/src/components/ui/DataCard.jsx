import { colorClasses } from "../../utils/constants";


const DataCard = ({ title, value, icon: Icon, color = "blue", description }) => {
  const classes = colorClasses[color] || colorClasses.gray;

  return (
    <div className="min-w-62.5 flex-1 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md">
      <div className="flex items-center gap-4">
        
        {/* Icon Container */}
        <div className={`flex h-12 w-12 items-center justify-center rounded-full ${classes.bg}`} >
          {Icon ? <Icon className={`h-6 w-6 ${classes.icon}`} /> : null}
        </div>

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