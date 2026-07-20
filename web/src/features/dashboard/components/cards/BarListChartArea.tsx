import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { type MetricFormatterFunction } from "@/src/features/widgets/chart-library/chart-props";
import { barListToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";

export type BarListDataPoint = {
  name: string;
  value: number;
};

/**
 * Presentational, one-way chart area for the fit-to-tile horizontal bar cards
 * (Traces, User consumption). It renders the leftover-height region a
 * {@link useFitRowCount} hook observes plus a definite-height inner box that
 * hosts a pure {@link Chart}. Data flows one way: the hook measures the
 * layout-guaranteed `flex-1` box (which this component never resizes) and hands
 * a concrete pixel `measuredHeightPx` down here; the chart is then a pure
 * function of that number and the already-sliced `data`. It never measures
 * itself, so there is no measure -> setState -> resize -> remeasure feedback.
 * Mirrors how DashboardGrid's `useDebouncedContainerWidth` measures once and
 * passes `width` down. (LFE-11060)
 */
export function BarListChartArea({
  containerRef,
  measuredHeightPx,
  isExpanded,
  data,
  barRowHeightPx,
  axisPaddingPx,
  maxExpandedBars,
  metricLabel,
  unit,
  metricFormatter,
}: {
  /** Callback ref from `useFitRowCount`; attaches the ResizeObserver here. */
  containerRef: (node: HTMLElement | null) => void;
  /**
   * Measured height of the observed box in px, or `null` before the first
   * measurement (SSR / initial paint). Recharts needs a definite height, so we
   * fall back until then.
   */
  measuredHeightPx: number | null;
  isExpanded: boolean;
  /** Bars to show, already sliced to the fitted/expanded count by the caller. */
  data: BarListDataPoint[];
  barRowHeightPx: number;
  axisPaddingPx: number;
  maxExpandedBars: number;
  metricLabel: string;
  unit: string;
  metricFormatter?: MetricFormatterFunction;
}) {
  return (
    // The chart fills the leftover tile height (flex-1) and never forces the
    // card past its tile. Collapsed, the inner box takes the measured height so
    // the bars spread to use it (a sparse list has no dead gap, a full one no
    // scrollbar); expanded, it grows to the bars' natural height and this
    // viewport scrolls within the tile. The observed (flex-1) box's height is
    // owned by layout, not by this content. (LFE-11060, revises LFE-11035)
    <div
      ref={containerRef}
      className="mt-4 min-h-0 w-full flex-1 overflow-y-auto"
    >
      <div
        className="w-full"
        style={{
          height: isExpanded
            ? data.length * barRowHeightPx + axisPaddingPx
            : (measuredHeightPx ?? 200),
        }}
      >
        <Chart
          chartType="HORIZONTAL_BAR"
          data={barListToDataPoints(data)}
          metricFormatter={metricFormatter}
          config={{ metric: { label: metricLabel } }}
          rowLimit={maxExpandedBars}
          chartConfig={{
            type: "HORIZONTAL_BAR",
            row_limit: maxExpandedBars,
            unit,
            show_value_labels: true,
          }}
        />
      </div>
    </div>
  );
}
