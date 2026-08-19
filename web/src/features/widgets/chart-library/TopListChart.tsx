import React, { useCallback, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import {
  formatMetric,
  toFullMetricString,
} from "@/src/features/widgets/chart-library/utils";

// Row rhythm: rows lay out top-aligned at up to MAX_ROW_PX each, shrink evenly
// down to MIN_ROW_PX when the tile is tight, and scroll below that. Done with
// flex-basis/min-height only, so the component never measures its container
// (charts must stay a pure function of their box — see BarListChartArea).
const MAX_ROW_PX = 56;
const MIN_ROW_PX = 20;
const ROW_GAP_PX = 1;
// Label/value text steps through the type scale with the row height (each
// row is a size container): text-xs by default, text-sm from 36px rows,
// text-base from 48px — never anything off-scale, capped at base.
const ROW_TEXT_STEPS =
  "text-xs [@container(min-height:36px)]:text-sm [@container(min-height:48px)]:text-base";

const CopyDimensionButton: React.FC<{ value: string }> = ({ value }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy "${value}"`}
      title={`Copy "${value}"`}
      className="text-muted-foreground hover:bg-background/60 hover:text-foreground pointer-events-auto shrink-0 rounded p-1 opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          // Shared util: falls back to execCommand on non-secure contexts
          // (plain-HTTP self-hosted deployments).
          await copyTextToClipboard(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch (error) {
          console.error("Unable to copy to clipboard", error);
        }
      }}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
};

/**
 * TopListChart: the HORIZONTAL_BAR visualiser. A ranked list where each row
 * shows the metric value in a left column and the dimension label on top of a
 * subtle proportional bar (top-list pattern à la Datadog). Rows keep a
 * readable rhythm regardless of how few or many there are — few rows sit
 * top-aligned instead of being spread across the tile — and the
 * dimension name is copyable on hover.
 */
export const TopListChart: React.FC<ChartProps> = ({
  data,
  metricFormatter = (value, options) => formatMetric(value, options),
  subtleFill = false,
}) => {
  const formatValue = useCallback(
    (value: number) =>
      toFullMetricString(metricFormatter(value, { style: "compact" })),
    [metricFormatter],
  );

  const rows = useMemo(
    () =>
      (data ?? []).map((d) => ({
        dimension: d.dimension ?? "n/a",
        value: typeof d.metric === "number" ? d.metric : Number(d.metric ?? 0),
      })),
    [data],
  );

  // Bars encode magnitude relative to the largest |value|; the signed value
  // in the adjacent column carries the sign. This keeps negative metrics
  // (e.g. an averaged -1..1 score) visually ranked instead of collapsing
  // every bar to zero width.
  const maxMagnitude = useMemo(
    () => Math.max(...rows.map((r) => Math.abs(r.value)), 0),
    [rows],
  );

  // Size the value column to the longest formatted value so bars align.
  const valueColumnCh = useMemo(
    () => Math.max(...rows.map((r) => formatValue(r.value).length), 2),
    [rows, formatValue],
  );

  return (
    <div
      // :has() dims every row except the hovered one, so the hovered row (and
      // its copy affordance) reads as the single focused item.
      className="flex h-full min-h-0 w-full flex-col overflow-x-hidden overflow-y-auto [&:has(>div:hover)>div:not(:hover)]:opacity-40"
      style={{ gap: ROW_GAP_PX }}
      data-testid="top-list-chart"
    >
      {rows.map((row, i) => (
        <div
          key={`${row.dimension}-${i}`}
          className="group/row hover:bg-accent/60 flex items-center gap-2 rounded-sm transition-opacity"
          style={{
            flex: `0 1 ${MAX_ROW_PX}px`,
            minHeight: MIN_ROW_PX,
            // Each row is a size container so ROW_TEXT_STEPS can step the
            // type scale by row height.
            containerType: "size",
          }}
          title={`${row.dimension}: ${formatValue(row.value)}`}
        >
          <div
            className={`shrink-0 text-right font-bold tabular-nums ${ROW_TEXT_STEPS}`}
            style={{ width: `${valueColumnCh}ch` }}
          >
            {formatValue(row.value)}
          </div>
          <div className="relative h-full min-w-0 flex-1">
            <div
              className="h-full rounded-sm"
              style={{
                width: `${maxMagnitude > 0 ? (Math.abs(row.value) / maxMagnitude) * 100 : 0}%`,
                backgroundColor: `hsl(var(--chart-1) / ${subtleFill ? 0.15 : 0.3})`,
              }}
            />
            <div
              className={`absolute inset-y-0 left-2 flex max-w-full min-w-0 items-center gap-1 pr-2 ${ROW_TEXT_STEPS}`}
            >
              <span className="text-foreground truncate" title={row.dimension}>
                {row.dimension}
              </span>
              <CopyDimensionButton value={row.dimension} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
