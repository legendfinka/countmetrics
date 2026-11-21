import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StatsRange, TimeseriesPoint } from "@countmetrics/shared";
import { formatTick, formatTooltip } from "./format";

// The same colours as the theme in index.css
const BRAND = "#2f7fc1";
const GOOD = "#3daa8a";
const MUTED = "#6b7785";
const LINE = "#e3e8ee";

/** The chart. It is loaded on demand, because the chart library is big. */
export function TimeseriesChart({ points, range }: { points: TimeseriesPoint[]; range: StatsRange }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={LINE} vertical={false} />
        <XAxis
          dataKey="time"
          tickFormatter={(time: string) => formatTick(time, range)}
          stroke={MUTED}
          fontSize={12}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis allowDecimals={false} stroke={MUTED} fontSize={12} width={36} tickLine={false} axisLine={false} />
        <Tooltip
          labelFormatter={(time: string) => formatTooltip(time, range)}
          contentStyle={{ border: `1px solid ${LINE}`, borderRadius: 4, fontSize: 13 }}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
        <Area
          type="monotone"
          dataKey="pageviews"
          name="Pageviews"
          stroke={BRAND}
          fill={BRAND}
          fillOpacity={0.15}
          strokeWidth={2}
          animationDuration={400}
        />
        <Area
          type="monotone"
          dataKey="visitors"
          name="Visitors"
          stroke={GOOD}
          fill={GOOD}
          fillOpacity={0.15}
          strokeWidth={2}
          animationDuration={400}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
