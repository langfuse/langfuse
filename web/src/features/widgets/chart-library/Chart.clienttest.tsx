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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
    expect(container.querySelector("svg")).toBeInTheDocument();
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

describe("Chart dispatcher — breakdown aggregate", () => {
  /**
   * `prepareBreakdownSegments` is unit-tested on its own; what only the real
   * dispatcher can catch is applying it to the wrong chart types. A stacked bar
   * and a pie are sized by the sum of their segments, so they must not draw the
   * breakdown's own total; every other mark draws each member independently and
   * must keep it.
   */
  const costBreakdown: DataPoint[] = [
    point(10, "total"),
    point(4, "input"),
    point(6, "output"),
  ];

  it("leaves the aggregate out of a stacked bar's segments", () => {
    render(
      <Chart
        chartType="BAR_TIME_SERIES"
        data={costBreakdown}
        rowLimit={100}
        breakdownAggregateValue="total"
      />,
    );

    expect(screen.queryByText("total")).not.toBeInTheDocument();
    expect(screen.getByText("input")).toBeInTheDocument();
    expect(screen.getByText("output")).toBeInTheDocument();
  });

  it("sizes a pie by its components, not by twice their sum", () => {
    render(
      <Chart
        chartType="PIE"
        data={costBreakdown}
        rowLimit={100}
        breakdownAggregateValue="total"
      />,
    );

    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.queryByText("20")).not.toBeInTheDocument();
  });

  it.each(["LINE_TIME_SERIES", "AREA_TIME_SERIES"] as const)(
    "keeps the aggregate for %s, which draws each member independently",
    (chartType) => {
      render(
        <Chart
          chartType={chartType}
          data={costBreakdown}
          rowLimit={100}
          breakdownAggregateValue="total"
        />,
      );

      expect(screen.getByText("total")).toBeInTheDocument();
    },
  );

  it("keeps a category named total when the breakdown declares no aggregate", () => {
    render(<Chart chartType="PIE" data={costBreakdown} rowLimit={100} />);

    expect(screen.getByText("20")).toBeInTheDocument();
  });
});

it("renders a compact bar chart whose values cross zero", () => {
  const bounds = new DOMRect(0, 0, 500, 63);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return this.id === "recharts_measurement_span"
        ? new DOMRect(0, 0, 8, 12)
        : bounds;
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class implements ResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ target, contentRect: bounds } as ResizeObserverEntry],
          this,
        );
      }
      unobserve() {}
      disconnect() {}
    },
  );

  const { container } = render(
    <Chart
      chartType="VERTICAL_BAR"
      data={[point(-1, "negative"), point(1, "positive")]}
      rowLimit={100}
      zeroBaseline
      hideXAxisLabels
    />,
  );

  expect(container.querySelectorAll('[role="graphics-symbol"]')).toHaveLength(
    2,
  );
  expect(container.querySelector("[data-zero-baseline]")).toHaveAttribute(
    "stroke-width",
    "1.5",
  );
  expect(screen.getByText("0")).toBeInTheDocument();
});
