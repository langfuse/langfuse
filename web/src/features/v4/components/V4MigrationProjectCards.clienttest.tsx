import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import {
  UsageStackedBarOverview,
  V4MigrationProjectCards,
} from "@/src/features/v4/components/V4MigrationProjectCards";
import type { ComponentProps, ReactNode } from "react";

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
  const baseProps = {
    projectId: "project-v4",
    legacyIntegrationSummary: {
      legacyIntegrationCount: 0,
      legacyIntegrations: {
        posthog: false,
        mixpanel: false,
        blobStorage: false,
      },
    },
    traceLevelEvalCount: 0,
    legacyApiUsage: [],
    traceLevelEvalExecutions: [],
    sdkUsage: {
      bucketTimes: ["2026-06-30T04:00:00.000Z", "2026-06-30T04:02:00.000Z"],
      rows: [],
    },
    isLegacyIntegrationSummaryLoading: false,
    isTraceLevelEvalSummaryLoading: false,
    isLegacyApiUsageLoading: false,
    isTraceLevelEvalExecutionsLoading: false,
    isSdkUsageLoading: false,
    hasLegacyIntegrationSummaryError: false,
    hasTraceLevelEvalSummaryError: false,
    hasLegacyApiUsageError: false,
    hasTraceLevelEvalExecutionsError: false,
    hasSdkUsageError: false,
  } satisfies ComponentProps<typeof V4MigrationProjectCards>;

  const renderCards = (
    overrides: Partial<ComponentProps<typeof V4MigrationProjectCards>> = {},
  ) =>
    render(
      <V4MigrationProjectCards
        {...baseProps}
        {...overrides}
        legacyIntegrationSummary={
          overrides.legacyIntegrationSummary ??
          baseProps.legacyIntegrationSummary
        }
        sdkUsage={overrides.sdkUsage ?? baseProps.sdkUsage}
      />,
    );

  beforeEach(() => {
    rechartsProps.barCharts.length = 0;
    rechartsProps.bars.length = 0;
    rechartsProps.yAxes.length = 0;
  });

  it("shows only outdated major SDK usage as a required action", () => {
    renderCards({
      sdkUsage: {
        bucketTimes: ["2026-06-30T04:00:00.000Z", "2026-06-30T04:02:00.000Z"],
        rows: [
          {
            time: "2026-06-30T04:00:00.000Z",
            sdkName: "python",
            sdkVersion: "3.9.0",
            publicKey: "pk-lf-old-python",
            count: 5,
            firstSeen: "2026-06-30T04:02:00.000Z",
            lastSeen: "2026-06-30T04:04:00.000Z",
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
            count: 2,
            firstSeen: "2026-06-30T04:00:00.000Z",
            lastSeen: "2026-06-30T04:00:00.000Z",
            canonicalSdkName: null,
            latestMajor: null,
            major: null,
            upgradeStatus: "unknown",
          },
          {
            time: "2026-06-30T04:00:00.000Z",
            sdkName: "unknown",
            sdkVersion: "unknown",
            publicKey: "pk-lf-raw-api",
            count: 4,
            firstSeen: "2026-06-30T04:00:00.000Z",
            lastSeen: "2026-06-30T04:00:00.000Z",
            canonicalSdkName: null,
            latestMajor: null,
            major: null,
            upgradeStatus: "unknown",
          },
          {
            time: "2026-06-30T04:00:00.000Z",
            sdkName: "javascript",
            sdkVersion: "5.0.0",
            publicKey: "pk-lf-current-js",
            count: 3,
            firstSeen: "2026-06-30T04:00:00.000Z",
            lastSeen: "2026-06-30T04:00:00.000Z",
            canonicalSdkName: "javascript",
            latestMajor: 5,
            major: 5,
            upgradeStatus: "current",
          },
          {
            time: "2026-06-30T04:00:00.000Z",
            sdkName: "custom-sdk",
            sdkVersion: "1.0.0",
            publicKey: "pk-lf-custom",
            count: 1,
            firstSeen: "2026-06-30T04:00:00.000Z",
            lastSeen: "2026-06-30T04:00:00.000Z",
            canonicalSdkName: null,
            latestMajor: null,
            major: null,
            upgradeStatus: "unsupported_sdk",
          },
          {
            time: "2026-06-30T04:00:00.000Z",
            sdkName: "python",
            sdkVersion: "dev",
            publicKey: "pk-lf-invalid-python",
            count: 1,
            firstSeen: "2026-06-30T04:00:00.000Z",
            lastSeen: "2026-06-30T04:00:00.000Z",
            canonicalSdkName: "python",
            latestMajor: 4,
            major: null,
            upgradeStatus: "invalid_version",
          },
        ],
      },
    });

    const requiredActions = within(screen.getByTestId("required-actions"));
    expect(requiredActions.getByText("SDK upgrades")).toBeInTheDocument();
    expect(requiredActions.getByText("python@3.9.0")).toBeInTheDocument();
    expect(requiredActions.getByText("pk-lf-old-python")).toBeInTheDocument();
    expect(requiredActions.getByText("Upgrade")).toBeInTheDocument();
    expect(requiredActions.queryByText("untracked")).not.toBeInTheDocument();
    expect(
      requiredActions.queryByText("unknown@unknown"),
    ).not.toBeInTheDocument();
    expect(
      requiredActions.queryByText("pk-lf-raw-api"),
    ).not.toBeInTheDocument();
    expect(
      requiredActions.queryByText("javascript@5.0.0"),
    ).not.toBeInTheDocument();
    expect(
      requiredActions.queryByText("custom-sdk@1.0.0"),
    ).not.toBeInTheDocument();
    expect(requiredActions.queryByText("python@dev")).not.toBeInTheDocument();

    const nonActionDetails = within(screen.getByTestId("non-action-details"));
    expect(
      nonActionDetails.getByText("Details that do not require action"),
    ).toBeInTheDocument();
    fireEvent.click(
      nonActionDetails.getByRole("button", {
        name: /Details that do not require action/i,
      }),
    );
    expect(nonActionDetails.queryByText("untracked")).not.toBeInTheDocument();
    expect(nonActionDetails.getByText("unknown@unknown")).toBeInTheDocument();
    expect(nonActionDetails.getByText("pk-lf-raw-api")).toBeInTheDocument();
    expect(nonActionDetails.getByText("javascript@5.0.0")).toBeInTheDocument();
    expect(nonActionDetails.getByText("custom-sdk@1.0.0")).toBeInTheDocument();
    expect(nonActionDetails.getByText("python@dev")).toBeInTheDocument();
    expect(
      nonActionDetails.getByText(
        "Current, unknown with API keys, unsupported, and invalid SDK telemetry is shown for context only.",
      ),
    ).toBeInTheDocument();

    expect(screen.queryByText("backend worker")).not.toBeInTheDocument();
    expect(screen.queryByText("untracked")).not.toBeInTheDocument();
    expect(screen.queryByText("No API key")).not.toBeInTheDocument();
    expect(
      screen.queryByText("unknown@unknown - No API key"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Upgrade guide")).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/observability/sdk/upgrade-path/python-v3-to-v4",
    );
    expect(screen.getAllByText("Due Nov 30, 2026").length).toBeGreaterThan(1);
  });

  it("shows the legacy export auto-switch consequence", () => {
    renderCards({
      legacyIntegrationSummary: {
        legacyIntegrationCount: 2,
        legacyIntegrations: {
          posthog: true,
          mixpanel: false,
          blobStorage: true,
        },
      },
    });

    const requiredActions = within(screen.getByTestId("required-actions"));
    expect(requiredActions.getByText("Legacy exports")).toBeInTheDocument();
    expect(requiredActions.getByText("PostHog")).toBeInTheDocument();
    expect(requiredActions.getByText("Blob Storage")).toBeInTheDocument();
    expect(
      requiredActions.getByText(
        "After November 30, 2026, Langfuse will auto-switch legacy exports to the new exports. Switch earlier to validate downstream schemas.",
      ),
    ).toBeInTheDocument();
    expect(requiredActions.getByText("Due Nov 30, 2026")).toBeInTheDocument();
  });

  it("shows all required sections with the migration deadline", () => {
    renderCards({
      traceLevelEvalCount: 1,
      legacyApiUsage: [
        {
          time: "2026-06-30T04:00:00.000Z",
          entrypoint: "publicapi: GET /api/public/traces",
          count: 12,
        },
      ],
      traceLevelEvalExecutions: [
        {
          time: "2026-06-30T04:00:00.000Z",
          scoreName: "quality",
          count: 4,
        },
      ],
      legacyIntegrationSummary: {
        legacyIntegrationCount: 1,
        legacyIntegrations: {
          posthog: false,
          mixpanel: true,
          blobStorage: false,
        },
      },
      sdkUsage: {
        bucketTimes: ["2026-06-30T04:00:00.000Z"],
        rows: [
          {
            time: "2026-06-30T04:00:00.000Z",
            sdkName: "python",
            sdkVersion: "3.9.0",
            publicKey: "pk-lf-old-python",
            count: 5,
            firstSeen: "2026-06-30T04:00:00.000Z",
            lastSeen: "2026-06-30T04:00:00.000Z",
            canonicalSdkName: "python",
            latestMajor: 4,
            major: 3,
            upgradeStatus: "outdated_major",
          },
        ],
      },
    });

    const requiredActions = within(screen.getByTestId("required-actions"));
    expect(requiredActions.getByText("SDK upgrades")).toBeInTheDocument();
    expect(requiredActions.getByText("Legacy public APIs")).toBeInTheDocument();
    expect(requiredActions.getByText("Trace-level evals")).toBeInTheDocument();
    expect(requiredActions.getByText("Legacy exports")).toBeInTheDocument();
    expect(requiredActions.getByText("1 route")).toBeInTheDocument();
    expect(requiredActions.getByText("1 integration")).toBeInTheDocument();
    expect(requiredActions.getAllByText("Due Nov 30, 2026")).toHaveLength(4);
  });

  it("shows a success audit when no required changes exist", () => {
    renderCards();

    expect(
      screen.getByText("No required v4 migration changes detected"),
    ).toBeInTheDocument();
    const requiredActions = within(screen.getByTestId("required-actions"));
    expect(requiredActions.queryByText("SDK upgrades")).not.toBeInTheDocument();
    expect(
      requiredActions.queryByText("Legacy public APIs"),
    ).not.toBeInTheDocument();
    const nonActionDetails = within(screen.getByTestId("non-action-details"));
    expect(
      nonActionDetails.getByText("Details that do not require action"),
    ).toBeInTheDocument();
    fireEvent.click(
      nonActionDetails.getByRole("button", {
        name: /Details that do not require action/i,
      }),
    );
    expect(
      nonActionDetails.getByText("No SDK usage detected in this range."),
    ).toBeInTheDocument();
  });
});
