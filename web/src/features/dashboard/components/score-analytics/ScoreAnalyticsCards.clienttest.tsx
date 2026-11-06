import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NumericScoreHistogramCard } from "./NumericScoreHistogramCard";
import { NumericScoreTimeSeriesCard } from "./NumericScoreTimeSeriesCard";
import { CategoricalScoreCard } from "./CategoricalScoreCard";
import { ModelCostTableCard } from "../ModelCostTableCard";

const { scheduledResult, histogramResult } = vi.hoisted(() => ({
  scheduledResult: {
    data: [] as Record<string, string | number | null>[],
    isLoading: false,
    isPending: false,
    isError: false,
    error: null as string | null,
  },
  histogramResult: {
    data: {
      chartData: [] as { binLabel: string; count: number }[],
      chartLabels: ["count"],
    },
    isLoading: false,
    isError: false,
    error: { message: "Query failed" },
  },
}));

vi.mock("@/src/utils/api", () => ({
  api: { dashboard: { scoreHistogram: { useQuery: () => histogramResult } } },
}));
vi.mock(
  "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider",
  () => ({
    useScheduledDashboardExecuteQuery: () => scheduledResult,
  }),
);
vi.mock("@/src/components/layouts/doc-popup", () => ({
  default: ({
    children,
  }: {
    children: (props: { getTriggerProps: () => object }) => React.ReactNode;
  }) => children({ getTriggerProps: () => ({}) }),
}));

const common = {
  projectId: "project",
  name: "Quality",
  source: "API" as const,
  dataType: "NUMERIC" as const,
  globalFilterState: [],
  metricsVersion: "v2" as const,
  fromTimestamp: new Date("2026-11-01T00:00:00.000Z"),
  toTimestamp: new Date("2026-11-02T00:00:00.000Z"),
  agg: "last30Days" as const,
};

beforeEach(() => {
  scheduledResult.data = [];
  scheduledResult.isLoading = false;
  scheduledResult.isPending = false;
  scheduledResult.isError = false;
  scheduledResult.error = null;
  histogramResult.data.chartData = [];
  histogramResult.isLoading = false;
  histogramResult.isError = false;
});

it("keeps model costs loading while queued, then shows a completed empty result", () => {
  scheduledResult.isPending = true;
  const queued = renderToStaticMarkup(
    <ModelCostTableCard {...common} className="" />,
  );
  expect(queued).toContain('aria-busy="true"');
  expect(queued).not.toContain("No data");
  expect(queued).toContain("<table");
  expect(queued).toContain(">Model</th>");
  expect(queued).toContain(">Tokens</th>");
  expect(queued).toContain(">USD</th>");

  scheduledResult.isPending = false;
  const completed = renderToStaticMarkup(
    <ModelCostTableCard {...common} className="" />,
  );
  expect(completed).toContain("No data");
});

describe.each([
  ["histogram", () => <NumericScoreHistogramCard {...common} />],
  ["time series", () => <NumericScoreTimeSeriesCard {...common} />],
  [
    "categorical",
    () => (
      <CategoricalScoreCard
        {...common}
        scoreData={{
          key: "quality",
          name: "Quality",
          source: "API",
          dataType: "CATEGORICAL",
        }}
      />
    ),
  ],
] as const)("%s card", (_name, chart) => {
  it("shows the card title and empty state", () => {
    const html = renderToStaticMarkup(chart());
    expect(html).toContain("<h3");
    expect(html).toContain("No data");
  });

  it("shows loading instead of an empty state", () => {
    scheduledResult.isLoading = true;
    scheduledResult.isPending = true;
    histogramResult.isLoading = true;
    const html = renderToStaticMarkup(chart());
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("No data");
  });

  it("shows query errors instead of an empty state", () => {
    scheduledResult.isError = true;
    scheduledResult.error = "Query failed";
    histogramResult.isError = true;
    const html = renderToStaticMarkup(chart());
    expect(html).toContain("Query failed");
    expect(html).not.toContain("No data");
  });

  if (_name !== "histogram") {
    it("shows loading while waiting for a scheduler slot", () => {
      scheduledResult.isPending = true;
      const html = renderToStaticMarkup(chart());
      expect(html).toContain('aria-busy="true"');
      expect(html).not.toContain("No data");
    });
  }
});

it("keeps zero-average scores visible", () => {
  scheduledResult.data = [
    {
      time_dimension: common.fromTimestamp.toISOString(),
      name: "Quality",
      avg_value: 0,
    },
  ];
  const html = renderToStaticMarkup(<NumericScoreTimeSeriesCard {...common} />);
  expect(html).toContain("Moving average over time");
  expect(html).not.toContain("No data");
});

it("requires confirmation before rendering a large histogram", () => {
  histogramResult.data.chartData = Array.from({ length: 2001 }, (_, index) => ({
    binLabel: String(index),
    count: 1,
  }));
  const html = renderToStaticMarkup(<NumericScoreHistogramCard {...common} />);
  expect(html).toContain("Large Dataset Warning");
  expect(html).toContain("I understand, proceed to render the chart");
});
