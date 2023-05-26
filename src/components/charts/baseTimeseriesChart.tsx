import {
  dateTimeAggregationSettings,
  type DateTimeAggregationOption,
} from "@/src/utils/types";
import { set } from "lodash";
import {
  LineChart,
  Line,
  XAxis,
  ResponsiveContainer,
  Tooltip,
  YAxis,
  Label,
  Legend,
} from "recharts";

export function TimeSeriesChart(props: {
  agg: DateTimeAggregationOption;
  data: { ts: number; values: { label: string; value: number }[] }[];
}) {
  const series = [
    ...new Set(props.data.flatMap((row) => row.values.map((v) => v.label))),
  ];

  const chartData = props.data.map((d) => ({
    ts: d.ts,
    ...d.values.reduce((acc, v) => ({ ...acc, [v.label]: v.value }), {}),
  }));

  return (
    <ResponsiveContainer width={"100%"} height={300}>
      <LineChart data={chartData} key={props.agg}>
        {series.map((s, i) => (
          <Line
            key={s}
            type="monotone"
            dataKey={s}
            isAnimationActive={false}
            strokeWidth={3}
            dot={{ strokeWidth: 2 }}
            stroke={chartColors[i % chartColors.length]}
          />
        ))}
        <XAxis
          dataKey="ts"
          type="number"
          domain={["dataMin", "dataMax"]}
          interval="preserveStartEnd"
          scale="time"
          tickLine
          tickCount={10}
          tickFormatter={(val, _index) =>
            dateTimeAggregationSettings[props.agg].date_formatter(
              new Date(val as number)
            )
          }
        >
          <Label
            value={dateTimeAggregationSettings[props.agg].date_trunc}
            offset={0}
            position="insideBottom"
          />
        </XAxis>
        <YAxis />
        <Tooltip
          labelFormatter={(val) =>
            dateTimeAggregationSettings[props.agg].date_formatter(
              new Date(val as number)
            )
          }
        />
        {series.length > 1 ? <Legend verticalAlign="top" height={36} /> : null}
      </LineChart>
    </ResponsiveContainer>
  );
}

const chartColors = [
  "#4c51bf", // Indigo
  "#f56565", // Red
  "#48bb78", // Green
  "#ed8936", // Orange
  "#6b46c1", // Purple
  "#38a169", // Teal
  "#e53e3e", // Pink
  "#3182ce", // Blue
  "#718096", // Gray
  "#9f7aea", // Indigo (lighter shade)
  "#f6ad55", // Red (lighter shade)
  "#68d391", // Green (lighter shade)
  "#f6ad55", // Orange (lighter shade)
  "#9f7aea", // Purple (lighter shade)
  "#4fd1c5", // Teal (lighter shade)
  "#ed64a6", // Pink (lighter shade)
  "#4299e1", // Blue (lighter shade)
];
