import { useMemo, useState } from "react";
import { ErrorBoundary } from "@sentry/nextjs";
import { useDocumentTheme } from "@modelcontextprotocol/ext-apps/react";
import { RefreshCw } from "@langfuse/icons";
import { TimeRangePicker } from "@/src/components/date-picker";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { LayerContainerProvider } from "@/src/context/LayerContext/LayerContext";
import { WidgetChartCard } from "@/src/features/widgets/components/WidgetChartCard";
import { DASHBOARD_AGGREGATION_OPTIONS } from "@/src/utils/date-range-utils";
import { cn } from "@/src/utils/tailwind";
import { type WidgetPayload } from "../../core/widget-payload";
import { type WidgetTimeRange } from "../../core/widget-time-ranges";
import {
  currentTimeRange,
  toPickerTimeRange,
  toWidgetTimeRange,
} from "./timeRanges";
import { toChartProps } from "./toChartProps";
import {
  resultText,
  useWidgetApp,
  type ToolResult,
  type WidgetAppState,
} from "./useWidgetApp";

const readPayload = (result: ToolResult): WidgetPayload | undefined => {
  const widget = (result._meta as { widget?: WidgetPayload } | undefined)
    ?.widget;
  return widget?.chartType ? widget : undefined;
};

/**
 * How a failed card can draw the chart again: `rerender` calls
 * `renderWidget` itself with the call's arguments; without them, `ask` sends
 * the user's request for a new chart to the chat.
 */
type Recovery = {
  kind: "rerender" | "ask" | "none";
  onRetry?: () => void;
  /** Sentence after the failure message saying what Retry does. */
  hint: string;
};

const chooseRecovery = (
  widget: WidgetAppState,
  timeRange: WidgetTimeRange,
): Recovery => {
  if (widget.canRerender) {
    return {
      kind: "rerender",
      onRetry: widget.pendingRange
        ? undefined
        : () => widget.rerender(timeRange),
      hint: "Retry to draw it again.",
    };
  }
  if (widget.redrawAsked) {
    return { kind: "none", hint: "Asked the assistant to draw it again." };
  }
  if (widget.canAskInChat) {
    return {
      kind: "ask",
      onRetry: widget.askToRedraw,
      hint: "Retry to ask the assistant to draw it again.",
    };
  }
  return { kind: "none", hint: "Ask again to redraw it." };
};

const LOADING = { type: "loading", progress: { type: "spinner" } } as const;

/**
 * Hosts keep tool results and replay them into a fresh view, so an old
 * conversation can hand this view a payload that a newer widget version no
 * longer reads. Rendering it again runs the widget from its current
 * definition.
 */
const staleWidgetCard = (recovery: Recovery, onRetry = recovery.onRetry) => (
  <WidgetChartCard
    title="Widget unavailable"
    content={{
      type: "error",
      message: `This chart was drawn by an older version and can no longer be shown. ${recovery.hint}`,
      onRetry,
    }}
  />
);

const tryChartProps = (payload: WidgetPayload) => {
  try {
    return toChartProps(payload);
  } catch {
    return undefined;
  }
};

/** The chart card for a payload, or the stale-widget card if it does not map. */
function WidgetChart({
  payload,
  loading,
  recovery,
}: {
  payload: WidgetPayload;
  loading: boolean;
  recovery: Recovery;
}) {
  const { onRetry } = recovery;
  const chartProps = tryChartProps(payload);
  if (!chartProps) {
    return loading ? (
      <WidgetChartCard title={payload.name} content={LOADING} />
    ) : (
      staleWidgetCard(recovery)
    );
  }
  return (
    <ErrorBoundary
      fallback={({ resetError }) =>
        staleWidgetCard(
          recovery,
          recovery.kind === "rerender" && onRetry
            ? () => {
                // Start the call first, so the reset renders its skeleton
                // rather than the chart that failed.
                onRetry();
                resetError();
              }
            : onRetry,
        )
      }
    >
      <WidgetChartCard
        {...chartProps}
        title={payload.name}
        description={payload.description || payload.timeRangeLabel}
        content={loading ? LOADING : undefined}
      />
    </ErrorBoundary>
  );
}

/** The card for the view's state: loading, a failure with Retry, or the chart. */
function WidgetCard({
  widget,
  payload,
  recovery,
}: {
  widget: WidgetAppState;
  payload: WidgetPayload | undefined;
  recovery: Recovery;
}) {
  const busy = widget.pendingRange !== null;
  const { error, result } = widget;
  if (error) {
    return (
      <WidgetChartCard
        title="Widget unavailable"
        content={{ type: "error", message: error.message }}
      />
    );
  }
  if (!result) {
    // A late result still replaces the failure card when it arrives.
    if (widget.resultOverdue && !busy) {
      return (
        <WidgetChartCard
          title="Widget unavailable"
          content={{
            type: "error",
            message: `The chart has not arrived. ${recovery.hint}`,
            onRetry: recovery.onRetry,
          }}
        />
      );
    }
    return <WidgetChartCard title="Loading widget" content={LOADING} />;
  }
  if (!payload) {
    return (
      <WidgetChartCard
        title="Widget unavailable"
        content={
          busy
            ? LOADING
            : {
                type: "error",
                message:
                  (result.isError && resultText(result)) ||
                  "No widget data in the tool result",
                onRetry: recovery.onRetry,
              }
        }
      />
    );
  }
  return <WidgetChart payload={payload} loading={busy} recovery={recovery} />;
}

/** The time range picker and refresh button above the card. */
function WidgetToolbar({
  timeRange,
  earliestTimestamp,
  busy,
  onTimeRangeChange,
  onAfterPickerOpenChange,
}: {
  timeRange: WidgetTimeRange;
  /** The earliest time the plan's data access allows, if it limits it. */
  earliestTimestamp: string | undefined;
  busy: boolean;
  onTimeRangeChange: (timeRange: WidgetTimeRange) => void;
  onAfterPickerOpenChange: (open: boolean) => void;
}) {
  // The picker resets an unfinished calendar selection whenever its value
  // changes identity, so the value only changes with the window itself.
  const rangeKey = JSON.stringify(timeRange);
  const pickerTimeRange = useMemo(
    () => toPickerTimeRange(JSON.parse(rangeKey) as WidgetTimeRange),
    [rangeKey],
  );
  return (
    <div className="flex items-center gap-1 pb-2">
      <TimeRangePicker
        className="my-0 min-w-0"
        triggerClassName="px-2"
        timeRange={pickerTimeRange}
        timeRangePresets={DASHBOARD_AGGREGATION_OPTIONS}
        disabled={
          earliestTimestamp
            ? { before: new Date(earliestTimestamp) }
            : undefined
        }
        onTimeRangeChange={(next) => onTimeRangeChange(toWidgetTimeRange(next))}
        onAfterOpenChange={onAfterPickerOpenChange}
      />
      {busy ? (
        <span
          role="status"
          aria-label="Updating chart"
          title="Updating chart"
          className="flex size-8 items-center justify-center"
        >
          <Spinner size="sm" variant="muted" />
        </span>
      ) : (
        <IconButton
          icon={RefreshCw}
          label="Refresh"
          onClick={() => onTimeRangeChange(timeRange)}
        />
      )}
    </div>
  );
}

/**
 * The `renderWidget` MCP App view, the page behind `ui://langfuse/widget.html`.
 * It renders the dashboard's `WidgetChartCard` from the widget definition
 * and rows in the tool result's `_meta.widget`.
 *
 * When the host proxies tool calls (`serverTools`), a toolbar above the card
 * offers the dashboard's time range picker and a refresh button. Both call
 * `renderWidget` again through the host (`useWidgetApp`) and render the
 * latest call's result in place.
 */
export function WidgetApp() {
  const widget = useWidgetApp();
  const theme = useDocumentTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Popovers portal into this node, inside the themed wrapper, so they get
  // its dark mode.
  const [overlayRoot, setOverlayRoot] = useState<HTMLDivElement | null>(null);

  const payload = widget.result ? readPayload(widget.result) : undefined;
  const timeRange = currentTimeRange({ ...widget, payload });
  const recovery = chooseRecovery(widget, timeRange);

  return (
    <div className={theme === "dark" ? "dark" : undefined}>
      <LayerContainerProvider name="popover" container={overlayRoot}>
        {/* The host sizes the frame to the document, and the picker's
            popover floats outside it, so the frame grows while it is open. */}
        <div
          className={cn(
            "bg-background text-foreground",
            pickerOpen && "min-h-[520px]",
          )}
        >
          {widget.canRerender && widget.result && (
            <WidgetToolbar
              timeRange={timeRange}
              earliestTimestamp={payload?.earliestTimestamp}
              busy={widget.pendingRange !== null}
              onTimeRangeChange={widget.rerender}
              onAfterPickerOpenChange={setPickerOpen}
            />
          )}
          <WidgetCard widget={widget} payload={payload} recovery={recovery} />
        </div>
      </LayerContainerProvider>
      <div ref={setOverlayRoot} />
    </div>
  );
}
