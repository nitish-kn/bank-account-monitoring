import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, } from "recharts";

const defaultColors = ["#16a34a", "#dc2626", "#2563eb", "#f59e0b"];

const CustomDonutChart = ({
  data = [],
  innerLabel = "",
  totalLabel,
  centerTextclassName,
  showLegend = false,
  showLabels = true,
  chartHeight = 180,
  innerRadius = "45%",
  outerRadius = "70%",
  legendValueFormatter,
}) => {
  const totalValue = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const centerValue = totalLabel ?? totalValue;
  
  return (
    <div
      className={`min-w-0 ${showLegend ? "grid min-h-[22rem] grid-cols-1 gap-3 md:h-60 md:min-h-0 md:grid-cols-[minmax(0,1fr)_minmax(150px,auto)]" : "h-60 w-full"}`}
      style={{ minWidth: 0, minHeight: 0 }}
    >
      <div className={showLegend ? "relative h-52 min-h-0 md:h-full" : "relative min-h-0"}>
        <ResponsiveContainer width="100%" height={showLegend ? "100%" : chartHeight}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={4}
              labelLine={false}
              label={showLabels ? ({ name, value }) => `${name}: ${value}` : false}
            >
              {data?.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || defaultColors[index % defaultColors.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name) => [value, name]} />
          </PieChart>
        </ResponsiveContainer>

        {innerLabel || totalLabel !== undefined ? (
          <div className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center ${centerTextclassName}`}>
            <p className="text-2xl font-bold text-gray-900">{centerValue}</p>
            {innerLabel ? <p className="text-xs font-medium text-gray-500">{innerLabel}</p> : null}
          </div>
        ) : null}
      </div>

      {showLegend ? (
        <div className="flex flex-col justify-center gap-2">
          {data.map((item, index) => (
            <div key={index} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-sm">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: item.color || defaultColors[index % defaultColors.length] }}
              />
              <span className="truncate font-medium text-gray-700">{item.name}</span>
              <span className="font-semibold text-gray-700">
                {legendValueFormatter ? legendValueFormatter(item) : item.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default CustomDonutChart;
