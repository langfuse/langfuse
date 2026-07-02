import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import {
  UsageStackedBarOverview,
  V4MigrationProjectCards,
} from "@/src/features/v4/components/V4MigrationProjectCards";
import type { ReactNode } from "react";

const rechartsProps = vi.hoisted(() => ({
  barCharts: [] as Array<{ margin?: { left?: number } }>,
  bars: [] as Array<{ dataKey?: string }>,
  yAxes: [] as Array<{
    width?: number;
    domain?: [number, number];
    interval?: number;
    ticks?: number[];
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
      domain: Array.isArray(props.domain)
        ? (props.domain as [number, number])
        : undefined,
      interval: typeof props.interval === "number" ? props.interval : undefined,
      ticks: Array.isArray(props.ticks) ? (props.ticks as number[]) : undefined,
      tickFormatter:
        typeof props.tickFormatter === "function"
          ? (props.tickFormatter as (value: number) => string)
          : undefined,
    });
    return <div data-testid="y-axis" />;
  },
  Tooltip: () => null,
  Bar: (props: Record<string, unknown>) => {
    rechartsProps.bars.push({
      dataKey: typeof props.dataKey === "string" ? props.dataKey : undefined,
    });
    return <div data-testid="bar" />;
  },
}));

describe("UsageStackedBarOverview", () => {
  beforeEach(() => {
    rechartsProps.barCharts.length = 0;
    rechartsProps.bars.length = 0;
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

  it("passes evenly spaced Y-axis ticks so intermediate values are not skipped", () => {
    render(
      <UsageStackedBarOverview
        bucketTimes={["2026-06-30T04:00:00.000Z"]}
        valueLabel="calls"
        series={[
          {
            name: "GET /api/public/traces",
            total: 1200,
            points: [1200],
          },
        ]}
      />,
    );

    expect(rechartsProps.yAxes[0]?.ticks).toEqual([0, 300, 600, 900, 1200]);
    expect(rechartsProps.yAxes[0]?.domain).toEqual([0, 1200]);
    expect(rechartsProps.yAxes[0]?.interval).toBe(0);
  });

  it("keeps Y-axis ticks as whole numbers for small count ranges", () => {
    render(
      <UsageStackedBarOverview
        bucketTimes={["2026-06-30T04:00:00.000Z"]}
        valueLabel="calls"
        series={[
          {
            name: "GET /api/public/traces",
            total: 5,
            points: [5],
          },
        ]}
      />,
    );

    expect(rechartsProps.yAxes[0]?.ticks).toEqual([0, 2, 4, 6, 8]);
  });

  it("can render every exact usage series without rolling hidden items into other", () => {
    render(
      <UsageStackedBarOverview
        bucketTimes={["2026-06-30T04:00:00.000Z"]}
        valueLabel="records"
        seriesLimit={null}
        series={Array.from({ length: 7 }, (_, index) => ({
          name: `python@3.${index}.0 - pk-lf-key-${index}`,
          total: index + 1,
          points: [index + 1],
        }))}
      />,
    );

    expect(rechartsProps.bars).toHaveLength(7);
    expect(screen.queryByText("Other")).not.toBeInTheDocument();
    expect(screen.getByText("python@3.6.0 - pk-lf-key-6")).toBeInTheDocument();
  });
});

describe("V4MigrationProjectCards SDK usage", () => {
  beforeEach(() => {
    rechartsProps.barCharts.length = 0;
    rechartsProps.bars.length = 0;
    rechartsProps.yAxes.length = 0;
  });

  it("shows SDK usage by exact SDK version and API key", () => {
    render(
      <V4MigrationProjectCards
        projectId="project-v4"
        legacyIntegrationSummary={{
          legacyIntegrationCount: 0,
          legacyIntegrations: {
            posthog: false,
            mixpanel: false,
            blobStorage: false,
          },
        }}
        traceLevelEvalCount={0}
        legacyApiUsage={[]}
        traceLevelEvalExecutions={[]}
        sdkUsage={[
          {
            time: "2026-06-30T04:00:00.000Z",
            sdkName: "python",
            sdkVersion: "3.9.0",
            publicKey: "pk-lf-old-python",
            apiKeyNote: "backend worker",
            count: 5,
            firstSeen: "2026-06-30T04:02:00.000Z",
            lastSeen: "2026-06-30T04:04:00.000Z",
            canonicalSdkName: "python",
            latestMajor: 4,
            major: 3,
            upgradeStatus: "outdated_major",
          },
          {
            time: "2026-06-30T04:02:00.000Z",
            sdkName: "python",
            sdkVersion: "3.9.0",
            publicKey: "pk-lf-old-python",
            apiKeyNote: "backend worker",
            count: 0,
            firstSeen: null,
            lastSeen: null,
            canonicalSdkName: "python",
            latestMajor: 4,
            major: 3,
            upgradeStatus: "outdated_major",
          },
          {
            time: "2026-06-30T04:00:00.000Z",
            sdkName: "unknown",
            sdkVersion: "unknown",
            publicKey: "",
            apiKeyNote: null,
            count: 2,
            firstSeen: "2026-06-30T04:00:00.000Z",
            lastSeen: "2026-06-30T04:00:00.000Z",
            canonicalSdkName: null,
            latestMajor: null,
            major: null,
            upgradeStatus: "unknown",
          },
        ]}
        isLegacyIntegrationSummaryLoading={false}
        isTraceLevelEvalSummaryLoading={false}
        isLegacyApiUsageLoading={false}
        isTraceLevelEvalExecutionsLoading={false}
        isSdkUsageLoading={false}
        hasLegacyIntegrationSummaryError={false}
        hasTraceLevelEvalSummaryError={false}
        hasLegacyApiUsageError={false}
        hasTraceLevelEvalExecutionsError={false}
        hasSdkUsageError={false}
      />,
    );

    expect(screen.getByText("SDK usage")).toBeInTheDocument();
    expect(screen.getByText("python@3.9.0")).toBeInTheDocument();
    expect(screen.getByText("pk-lf-old-python")).toBeInTheDocument();
    expect(screen.getByText("backend worker")).toBeInTheDocument();
    expect(screen.getAllByText("untracked").length).toBeGreaterThan(0);
    expect(
      screen.queryByText("unknown@unknown - No API key"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Upgrade")).toBeInTheDocument();
    expect(screen.getByText("Upgrade guide")).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/observability/sdk/upgrade-path/python-v3-to-v4",
    );
    expect(rechartsProps.bars).toHaveLength(2);
  });
});
