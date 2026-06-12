import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, LabelList, } from "recharts";
import { formatCompactINR } from "../../lib/helper";


const formatCurrency = (value) => {
  const amount = Number(value || 0);
  if (Number.isNaN(amount)) return "₹0";
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};

export const CustomBarChart = ({
  data = [],
  dataKey = "amount",
  categoryKey = "category",
  color = "#2563eb",
}) => {
  return (
    <div className="h-60 w-full" style={{ minWidth: 0, minHeight: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 10, right: 50, bottom: 10, left: -50 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            type="number"
            tickFormatter={formatCurrency}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#4b5563" }}
          />
          <YAxis
            type="category"
            dataKey={categoryKey}
            width={140}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#4b5563" }}
          />
          <Tooltip formatter={(value) => formatCurrency(value)} />
          <Bar dataKey={dataKey} fill={color} radius={[10, 10, 10, 10]}>
            <LabelList dataKey={dataKey} position="right" formatter={formatCompactINR} className="text-xs font-semibold text-gray-800!"/>
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

