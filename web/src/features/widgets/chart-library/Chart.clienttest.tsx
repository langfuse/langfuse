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
 * `useChartTickBudget`) needs one to mount without throwing. The stub reports
 * a real box on observe — with jsdom's 0x0 layout recharts would otherwise
 * draw no marks at all, and the semantic-color assertions below need actual
 * SVG shapes to inspect.
 */
class ResizeObserverStub {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    const contentRect = {
      width: 800,
      height: 400,
      top: 0,
      left: 0,
      bottom: 400,
      right: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
    this.callback(
      [{ target, contentRect } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
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

/**
 * Render-level coverage for semantic series colors (LFE-15467): a unit test
 * on `prepareSeriesColors` can't catch the category-bar specificity trap —
 * the `fill-(--color-metric)` CLASS on <Bar> overrides per-<Cell> fill
 * ATTRIBUTES, so per-category colors only render if the class is dropped.
 * Only mounting the real chart proves the fills survive to the SVG.
 */
describe("Chart dispatcher — semantic series colors (LFE-15467)", () => {
  const bars = (dimensions: string[]): DataPoint[] =>
    dimensions.map((dimension, i) => point(10 * (i + 1), dimension));

  it("colors category bars per status value and drops the uniform class fill", () => {
    const { container } = render(
      <Chart
        chartType="HORIZONTAL_BAR"
        data={bars(["pass", "borderline", "fail"])}
        rowLimit={100}
        semanticContext={{ field: "score-categorical" }}
      />,
    );
    expect(
      container.querySelector('[fill="var(--chart-status-ok)"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[fill="var(--chart-status-warning)"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[fill="var(--chart-status-error)"]'),
    ).toBeInTheDocument();
    // The class fill would override the per-cell attributes — must be gone.
    expect(
      container.querySelector('[class*="fill-(--color-metric)"]'),
    ).not.toBeInTheDocument();
  });

  it("keeps the uniform metric fill when no status value is present", () => {
    const { container } = render(
      <Chart
        chartType="VERTICAL_BAR"
        data={bars(["alpha", "beta", "gamma"])}
        rowLimit={100}
      />,
    );
    expect(
      container.querySelector('[class*="fill-(--color-metric)"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[fill^="var(--chart-status-"]'),
    ).not.toBeInTheDocument();
  });

  it("colors pie slices by the level vocabulary under the level gate", () => {
    const { container } = render(
      <Chart
        chartType="PIE"
        data={bars(["DEFAULT", "DEBUG", "WARNING", "ERROR"])}
        rowLimit={100}
        semanticContext={{ field: "level" }}
      />,
    );
    for (const token of ["ok", "neutral", "warning", "error"]) {
      expect(
        container.querySelector(`[fill="var(--chart-status-${token})"]`),
      ).toBeInTheDocument();
    }
  });

  it("does NOT color the 'default' environment green without the level gate", () => {
    const { container } = render(
      <Chart
        chartType="PIE"
        data={bars(["default", "staging", "production"])}
        rowLimit={100}
      />,
    );
    expect(
      container.querySelector('[fill^="var(--chart-status-"]'),
    ).not.toBeInTheDocument();
  });
});
