import React, { type ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "@/src/features/i18n/messages";

/**
 * Dispatcher integration coverage for the LFE-14333 empty-state guard: a unit
 * test on `isChartDataEmpty` alone can't catch a wiring mistake in `Chart`
 * (wrong prop threaded through, guard applied to the wrong chart types, the
 * `isLoading` gate dropped) — only rendering the real dispatcher can.
 *
 * jsdom has no `ResizeObserver`; recharts' `ResponsiveContainer` (via
 * `useChartTickBudget`) needs one to mount without throwing. A minimal stub
 * is enough — this suite never asserts on measured width.
 */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as typeof globalThis & { ResizeObserver: unknown }).ResizeObserver =
  ResizeObserverStub;

afterEach(cleanup);

const renderEnglish = (element: ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={getMessages("en")}>
      {element}
    </NextIntlClientProvider>,
  );

const point = (metric: DataPoint["metric"], dimension?: string): DataPoint => ({
  time_dimension: "2026-01-01T00:00:00Z",
  dimension,
  metric,
});

describe("Chart dispatcher — empty-state guard (LFE-14333)", () => {
  it("shows NoDataOrLoading for an empty data array", () => {
    renderEnglish(
      <Chart chartType="LINE_TIME_SERIES" data={[]} rowLimit={100} />,
    );
    expect(screen.getByText("No data")).toBeInTheDocument();
  });

  it("shows NoDataOrLoading when every point's metric is null", () => {
    const data = [point(null), point(null, "series-a")];
    renderEnglish(
      <Chart chartType="LINE_TIME_SERIES" data={data} rowLimit={100} />,
    );
    expect(screen.getByText("No data")).toBeInTheDocument();
  });

  it("does NOT show NoDataOrLoading when every point's metric is a real 0", () => {
    const data = [point(0), point(0, "series-a")];
    const { container } = renderEnglish(
      <Chart chartType="LINE_TIME_SERIES" data={data} rowLimit={100} />,
    );
    expect(screen.queryByText("No data")).not.toBeInTheDocument();
    // The real chart primitive mounted instead of the empty-state box —
    // `ChartContainer` stamps a `data-chart` id on its wrapper unconditionally,
    // independent of the (jsdom-only) 0x0 layout warning recharts logs when it
    // can't measure a real box to size its <svg> surface.
    expect(container.querySelector("[data-chart]")).toBeInTheDocument();
  });

  it("does NOT show NoDataOrLoading while isLoading, even with no data yet", () => {
    renderEnglish(
      <Chart
        chartType="LINE_TIME_SERIES"
        data={[]}
        rowLimit={100}
        isLoading={true}
      />,
    );
    expect(screen.queryByText("No data")).not.toBeInTheDocument();
  });

  it("applies the same guard to AREA_TIME_SERIES and BAR_TIME_SERIES", () => {
    renderEnglish(
      <Chart chartType="AREA_TIME_SERIES" data={[]} rowLimit={100} />,
    );
    expect(screen.getByText("No data")).toBeInTheDocument();
    cleanup();
    renderEnglish(
      <Chart chartType="BAR_TIME_SERIES" data={[]} rowLimit={100} />,
    );
    expect(screen.getByText("No data")).toBeInTheDocument();
  });
});
