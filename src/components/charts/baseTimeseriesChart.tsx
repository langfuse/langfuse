import {
  dateTimeAggregationSettings,
  type DateTimeAggregationOption,
} from "@/src/utils/types";
import {
  LineChart,
  Line,
  XAxis,
  ResponsiveContainer,
  Tooltip,
  YAxis,
  Label,
} from "recharts";

export function TimeSeriesChart(props: {
  agg: DateTimeAggregationOption;
  data: { ts: number; value: number }[];
}) {
  return (
    <ResponsiveContainer width={"100%"} height={300}>
      <LineChart data={props.data} key={props.agg}>
        <Line
          type="monotone"
          dataKey="value"
          stroke="#8884d8"
          isAnimationActive={false}
          strokeWidth={3}
          dot={{ strokeWidth: 2 }}
        />
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
      </LineChart>
    </ResponsiveContainer>
  );
}
