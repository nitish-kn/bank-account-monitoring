import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactINR } from "../../lib/helper";

const formatTrendAmount = (value) => {
  const amount = Number(value || 0);

  if (amount === 0) return "0";

  return formatCompactINR(amount);
};

const TrendTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  const item = payload.find((entry) => entry?.payload)?.payload;

  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-gray-900">{label}</p>
      <p className={item?.netAmount >= 0 ? "text-green-600" : "text-red-500"}>
        Net: {formatCompactINR(item?.netAmount)}
      </p>
    </div>
  );
};

const CustomAreaTrendChart = ({
  data = [],
  xKey = "label",
  positiveKey = "positiveAmount",
  negativeKey = "negativeAmount",
  height = 220,
  positiveColor = "#16a34a",
  negativeColor = "#ef4444",
}) => {
  const maxAbsValue = data.reduce((max, item) => {
    const pos = Math.abs(Number(item[positiveKey]) || 0);
    const neg = Math.abs(Number(item[negativeKey]) || 0);
    return Math.max(max, pos, neg);
  }, 1000);

  const paddedMax = maxAbsValue * 1.1;
  const yDomain = [-paddedMax, paddedMax];

  return (
    <div className="w-full" style={{ height, minWidth: 0, minHeight: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -15 }}>
          <defs>
            <linearGradient id="positiveCashFlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={positiveColor} stopOpacity={0.22} />
              <stop offset="95%" stopColor={positiveColor} stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="negativeCashFlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={negativeColor} stopOpacity={0.18} />
              <stop offset="95%" stopColor={negativeColor} stopOpacity={0.03} />
            </linearGradient>
          </defs>
 
          <CartesianGrid stroke="#e5e7eb" vertical={false} strokeDasharray="3 3" />
          <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />
          <XAxis
            dataKey={xKey}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            tick={{ fill: "#4b5563", fontSize: 12 }}
            minTickGap={28}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tickFormatter={formatTrendAmount}
            tick={{ fill: "#4b5563", fontSize: 12 }}
            width={54}
            domain={yDomain}
          />
          <Tooltip content={<TrendTooltip />} />
          <Area
            type="monotone"
            dataKey={positiveKey}
            stroke={positiveColor}
            strokeWidth={2}
            fill="url(#positiveCashFlow)"
            connectNulls={false}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Area
            type="monotone"
            dataKey={negativeKey}
            stroke={negativeColor}
            strokeWidth={2}
            fill="url(#negativeCashFlow)"
            connectNulls={false}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CustomAreaTrendChart;
