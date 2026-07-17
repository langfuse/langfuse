import React, { useMemo } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
import {
  Label,
  Pie,
  PieChart as PieChartComponent,
  Sector,
  type PieSectorShapeProps,
} from "recharts";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";

/**
 * PieChart component
 * @param data - Data to be displayed. Expects an array of objects with dimension and metric properties.
 * @param config - Configuration object for the chart. Can include theme settings for light and dark modes.
 * @param accessibilityLayer - Boolean to enable or disable the accessibility layer. Default is true.
 * @param trueTotal - Deduplicated total for the center label. Slices of an
 *   exploded (array) breakdown overlap — an entity is counted once per
 *   matching bucket — so summing them overstates the real entity count; the
 *   caller supplies the honest total instead (Mixpanel-style independent
 *   total). Falls back to the slice sum when omitted.
 */
export const PieChart: React.FC<ChartProps & { trueTotal?: number }> = ({
  data,
  config = {
    metric: {
      theme: {
        light: "hsl(var(--chart-1))",
        dark: "hsl(var(--chart-1))",
      },
    },
  },
  accessibilityLayer = true,
  metricFormatter = (value, options) => formatMetric(value, options),
  subtleFill = false,
  trueTotal,
}) => {
  const formatValue = (value: number) =>
    toFullMetricString(metricFormatter(value, { style: "compact" }));

  // Center label: honest caller-provided total, else the sum of slices.
  const totalValue = useMemo(() => {
    if (trueTotal !== undefined) return trueTotal;
    return data.reduce((acc, curr) => acc + (curr.metric as number), 0);
  }, [data, trueTotal]);

  // Transform data for PieChart
  const chartData = useMemo(() => {
    return data.map((item, index) => ({
      name: item.dimension || "Unknown",
      value: item.metric,
      fill: `hsl(var(--chart-${(index % 8) + 1}))`,
    }));
  }, [data]);

  const renderSector = (props: PieSectorShapeProps) => {
    const outerRadius =
      typeof props.outerRadius === "number" ? props.outerRadius : 0;
    const expandedOuterRadius = props.isActive ? outerRadius + 10 : outerRadius;

    return (
      <Sector
        {...props}
        outerRadius={expandedOuterRadius}
        opacity={
          subtleFill ? (props.isActive ? 0.9 : 0.45) : props.isActive ? 1 : 0.82
        }
        stroke="hsl(var(--background))"
        strokeWidth={props.isActive ? 4 : 3}
      />
    );
  };

  return (
    <ChartContainer config={config}>
      <PieChartComponent accessibilityLayer={accessibilityLayer}>
        <ChartTooltip
          contentStyle={{ backgroundColor: "hsl(var(--background))" }}
          content={({ active, payload, label }) => (
            <ChartTooltipContent
              active={active}
              payload={payload}
              label={label}
              valueFormatter={(v) => formatValue(Number(v))}
            />
          )}
        />
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={80}
          outerRadius={120}
          paddingAngle={2}
          strokeWidth={5}
          shape={renderSector}
          isAnimationActive={false}
        >
          {/* Label in the center of the donut */}
          {data.length > 0 && (
            <Label
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  return (
                    <text
                      x={viewBox.cx}
                      y={viewBox.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      <tspan
                        x={viewBox.cx}
                        y={viewBox.cy}
                        className="fill-foreground text-3xl font-bold"
                      >
                        {formatValue(totalValue)}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) + 24}
                        className="fill-muted-foreground"
                      >
                        Total
                      </tspan>
                    </text>
                  );
                }
                return null;
              }}
            />
          )}
        </Pie>
      </PieChartComponent>
    </ChartContainer>
  );
};

export default PieChart;
