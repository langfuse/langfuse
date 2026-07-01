import { render } from "@testing-library/react";
import { vi } from "vitest";
import { UsageStackedBarOverview } from "@/src/features/v4/components/V4MigrationProjectCards";
import type { ReactNode } from "react";

const rechartsProps = vi.hoisted(() => ({
  barCharts: [] as Array<{ margin?: { left?: number } }>,
  yAxes: [] as Array<{
    width?: number;
    tickFormatter?: (value: number) => string;
  }>,
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({
    children,
    margin,
  }: {
    children: ReactNode;
    margin?: { left?: number };
  }) => {
    rechartsProps.barCharts.push({ margin });
    return <div data-testid="bar-chart">{children}</div>;
  },
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: (props: Record<string, unknown>) => {
    rechartsProps.yAxes.push({
      width: typeof props.width === "number" ? props.width : undefined,
      tickFormatter:
        typeof props.tickFormatter === "function"
          ? (props.tickFormatter as (value: number) => string)
          : undefined,
    });
    return <div data-testid="y-axis" />;
  },
  Tooltip: () => null,
  Bar: () => <div data-testid="bar" />,
}));

describe("UsageStackedBarOverview", () => {
  beforeEach(() => {
    rechartsProps.barCharts.length = 0;
    rechartsProps.yAxes.length = 0;
  });

  it("keeps compact Y-axis labels within the chart bounds", () => {
    render(
      <UsageStackedBarOverview
        bucketTimes={["2026-06-30T04:00:00.000Z"]}
        valueLabel="calls"
        series={[
          {
            name: "GET /api/public/traces",
            total: 1800,
            points: [1800],
          },
        ]}
      />,
    );

    expect(rechartsProps.barCharts[0]?.margin?.left).toBeGreaterThanOrEqual(8);
    expect(rechartsProps.yAxes[0]?.width).toBeGreaterThanOrEqual(42);
    expect(rechartsProps.yAxes[0]?.tickFormatter?.(1800)).toBe("1.8K");
  });
});
