import { useMemo } from "react";
import {
  type Visualization,
  VisualizationFrame,
} from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import { type NotebookBlock } from "@/src/features/notebooks/schema";
import { assertUnreachable } from "@/src/utils/types";
import { useNotebookMetricVisualization } from "./useNotebookMetricVisualization";

type ChartState =
  | { type: "ready"; rows: Record<string, unknown>[] }
  | { type: "loading" }
  | { type: "error"; onRetry: () => void };

export function NotebookChart({
  block,
  state,
}: {
  block: Extract<NotebookBlock, { schema: "chart@1" }>;
  state: ChartState;
}) {
  const { title, query, display } = block.props;
  const isBigNumber = display.kind === "big-number";
  const bigNumber = useMemo(() => {
    if (display.kind !== "big-number" || state.type !== "ready") return;
    const metric = query.metrics[0];
    const raw =
      metric && state.rows[0]?.[`${metric.aggregation}_${metric.measure}`];
    const value = typeof raw === "string" && raw.trim() ? Number(raw) : raw;
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Intl.NumberFormat(undefined, {
        ...display.format,
        ...(display.format.style === "percent" && { maximumFractionDigits: 1 }),
      }).format(value);
    }
  }, [display, query.metrics, state]);

  const content = (() => {
    if (isBigNumber && bigNumber !== undefined) {
      return (
        <div>
          <p className="text-2xl font-bold tabular-nums">{bigNumber}</p>
          {display.caption && (
            <p className="text-muted-foreground mt-1 text-xs">
              {display.caption}
            </p>
          )}
        </div>
      );
    }
    if (state.type === "ready" && !isBigNumber && query.metrics.length > 0) {
      return query.metrics.map(({ aggregation, measure }) => (
        <NotebookMetricChart
          key={`${aggregation}_${measure}`}
          field={`${aggregation}_${measure}`}
          label={
            aggregation === measure ? measure : `${aggregation} ${measure}`
          }
          showLabel={query.metrics.length > 1}
          rows={state.rows}
          dimensions={query.dimensions}
          hasTimeDimension={query.timeDimension !== null}
          kind={display.kind}
        />
      ));
    }
    return (
      <div className={isBigNumber ? "h-16" : "h-64"}>
        <VisualizationFrame
          content={((): Visualization => {
            if (state.type === "error") {
              return {
                type: "error",
                message: "Could not load chart.",
                onRetry: state.onRetry,
              };
            }
            if (state.type === "loading") {
              return { type: "loading", progress: { type: "spinner" } };
            }
            if (state.type === "ready") return { type: "empty" };
            return assertUnreachable(state);
          })()}
        />
      </div>
    );
  })();

  return (
    <figure className="bg-background flex min-w-0 flex-1 flex-col gap-3 rounded-lg border p-4">
      <figcaption className="text-sm font-medium wrap-break-word">
        {title || "Chart"}
      </figcaption>
      {content}
    </figure>
  );
}

function NotebookMetricChart({
  showLabel,
  ...metric
}: Parameters<typeof useNotebookMetricVisualization>[0] & {
  showLabel: boolean;
}) {
  const content = useNotebookMetricVisualization(metric);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {showLabel && (
        <p className="text-muted-foreground text-xs">{metric.label}</p>
      )}
      <div className="h-64">
        <VisualizationFrame content={content} />
      </div>
    </div>
  );
}
