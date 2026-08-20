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
    // Two boxes, deliberately split:
    //
    //  - the OUTER box carries the ResizeObserver ref and does NOT scroll. Its
    //    height is pure flex layout (flex-1 of the card), so it can never be
    //    reduced by a scrollbar appearing on a descendant. useFitRowCount
    //    therefore measures a stable value and cannot enter a
    //    measure -> shrink -> remeasure loop — even in browsers/OSes whose
    //    scrollbars consume layout space (classic, non-overlay).
    //  - the INNER box scrolls: `overflow-y-auto` lets the expanded list scroll
    //    within the tile, while `overflow-x-hidden` stops a horizontal scrollbar
    //    from ever appearing (the chart is width-fitted, so nothing is clipped).
    //    A horizontal scrollbar is what would otherwise consume vertical space
    //    and flicker on wide content (e.g. many long trace names).
    //
    // The chart is a pure function of the passed dimensions and never measures
    // itself. Collapsed, the sized box takes the measured height so the bars
    // spread to fill it (no dead gap, no scrollbar); expanded, it grows to the
    // bars' natural height and the inner box scrolls. (LFE-11060, revises LFE-11035)
    <div ref={containerRef} data-fit-box className="mt-4 min-h-0 w-full flex-1">
      <div className="h-full min-h-0 w-full overflow-x-hidden overflow-y-auto">
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
    </div>
  );
}
