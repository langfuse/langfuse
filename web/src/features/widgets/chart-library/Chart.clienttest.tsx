import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";

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

const point = (metric: DataPoint["metric"], dimension?: string): DataPoint => ({
  time_dimension: "2026-01-01T00:00:00Z",
  dimension,
  metric,
});

describe("Chart dispatcher — empty-state guard (LFE-14333)", () => {
  it("shows NoDataOrLoading for an empty data array", () => {
    render(<Chart chartType="LINE_TIME_SERIES" data={[]} rowLimit={100} />);
    expect(screen.getByText("No data")).toBeInTheDocument();
  });

  it("shows NoDataOrLoading when every point's metric is null", () => {
    const data = [point(null), point(null, "series-a")];
    render(<Chart chartType="LINE_TIME_SERIES" data={data} rowLimit={100} />);
    expect(screen.getByText("No data")).toBeInTheDocument();
  });

  it("does NOT show NoDataOrLoading when every point's metric is a real 0", () => {
    const data = [point(0), point(0, "series-a")];
    const { container } = render(
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
    render(
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
    render(<Chart chartType="AREA_TIME_SERIES" data={[]} rowLimit={100} />);
    expect(screen.getByText("No data")).toBeInTheDocument();
    cleanup();
    render(<Chart chartType="BAR_TIME_SERIES" data={[]} rowLimit={100} />);
    expect(screen.getByText("No data")).toBeInTheDocument();
  });
});

describe("Chart dispatcher — recharts nice-tick domain crash", () => {
  // jsdom never measures a real plot box, so CartesianGrid may skip the
  // selector that throws in production. Call the same function the grid uses.
  it("getNiceTickValues does not throw on a zero-to-denormal Y domain", async () => {
    const { getNiceTickValues } = await import("recharts");
    expect(() =>
      getNiceTickValues([0, Number.MIN_VALUE], 5, true, "adaptive"),
    ).not.toThrow();
  });

  it("getNiceTickValues still returns rounded ticks for a normal domain", async () => {
    const { getNiceTickValues } = await import("recharts");
    const ticks = getNiceTickValues([0, 1], 5, true, "adaptive");
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks[0]).toBeLessThanOrEqual(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(1);
  });
});
