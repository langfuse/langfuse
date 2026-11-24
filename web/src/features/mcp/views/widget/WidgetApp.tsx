import { useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "@sentry/nextjs";
import {
  useApp,
  useDocumentTheme,
  useHostStyles,
  type App,
  type McpUiToolResultNotification,
} from "@modelcontextprotocol/ext-apps/react";
import { RefreshCw } from "@langfuse/icons";
import { TimeRangePicker } from "@/src/components/date-picker";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { WidgetChartCard } from "@/src/features/widgets/components/WidgetChartCard";
import {
  DASHBOARD_AGGREGATION_OPTIONS,
  TIME_RANGES,
  type TimeRange,
} from "@/src/utils/date-range-utils";
import { cn } from "@/src/utils/tailwind";
import {
  RENDER_WIDGET_TOOL_NAME,
  type WidgetPayload,
} from "../../core/widget-payload";
import {
  DEFAULT_WIDGET_TIME_RANGE,
  WIDGET_TIME_RANGES,
  type WidgetTimeRange,
} from "../../core/widget-time-ranges";
import { toChartProps } from "./toChartProps";

type ToolResult = McpUiToolResultNotification["params"];
type ToolArguments = Record<string, unknown>;

const readPayload = (result: ToolResult): WidgetPayload | undefined => {
  const widget = (result._meta as { widget?: WidgetPayload } | undefined)
    ?.widget;
  return widget?.chartType ? widget : undefined;
};

const resultText = (result: ToolResult) =>
  result.content?.find((block) => block.type === "text")?.text;

/**
 * How long the view waits for the host's tool result before it offers Retry.
 * Long enough for a slow chart query, which the host sends when it finishes.
 */
const RESULT_WAIT_MS = 30_000;

const errorResult = (message: string): ToolResult => ({
  isError: true,
  content: [{ type: "text", text: message }],
});

/** The picker's preset keys ("last7Days") as `renderWidget` abbreviations. */
const toWidgetTimeRange = (timeRange: TimeRange): WidgetTimeRange =>
  "from" in timeRange
    ? { from: timeRange.from.toISOString(), to: timeRange.to.toISOString() }
    : {
        range:
          TIME_RANGES[timeRange.range as keyof typeof TIME_RANGES]
            ?.abbreviation ?? DEFAULT_WIDGET_TIME_RANGE,
      };

const toPickerTimeRange = (timeRange: WidgetTimeRange): TimeRange =>
  "from" in timeRange
    ? { from: new Date(timeRange.from), to: new Date(timeRange.to) }
    : {
        range:
          WIDGET_TIME_RANGES.get(timeRange.range)?.key ??
          WIDGET_TIME_RANGES.get(DEFAULT_WIDGET_TIME_RANGE)!.key,
      };

/** The time window a `renderWidget` call asked for. */
const argumentsTimeRange = (args: ToolArguments): WidgetTimeRange => {
  const { timeRange, fromTimestamp, toTimestamp } = args;
  if (typeof fromTimestamp === "string" && typeof toTimestamp === "string") {
    return { from: fromTimestamp, to: toTimestamp };
  }
  return {
    range:
      typeof timeRange === "string" ? timeRange : DEFAULT_WIDGET_TIME_RANGE,
  };
};

/** The call's arguments with its time window replaced. */
const withTimeRange = (
  args: ToolArguments,
  timeRange: WidgetTimeRange,
): ToolArguments => {
  const rest = { ...args };
  delete rest.timeRange;
  delete rest.fromTimestamp;
  delete rest.toTimestamp;
  return "from" in timeRange
    ? { ...rest, fromTimestamp: timeRange.from, toTimestamp: timeRange.to }
    : { ...rest, timeRange: timeRange.range };
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

/** The message the chat gets when the user retries a chart without its arguments. */
const REDRAW_REQUEST =
  "The Langfuse chart above did not load. Please draw it again with renderWidget.";

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
      <WidgetChartCard
        title={payload.name}
        content={{ type: "loading", progress: { type: "spinner" } }}
      />
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
        content={
          loading
            ? { type: "loading", progress: { type: "spinner" } }
            : undefined
        }
      />
    </ErrorBoundary>
  );
}

/**
 * Tells the model what the chart shows after the user changed it. Hosts pass
 * the latest update along with the user's next message.
 */
const shareChartWithModel = (app: App, result: ToolResult) => {
  const summary = resultText(result);
  if (!summary || !app.getHostCapabilities()?.updateModelContext) return;
  app
    .updateModelContext({
      content: [
        {
          type: "text",
          text: `The user re-rendered the Langfuse chart from its controls. It now shows: ${summary}`,
        },
      ],
    })
    .catch(() => {
      // The chart is already updated; the model just keeps the older summary.
    });
};

/**
 * The `renderWidget` MCP App view, the page behind `ui://langfuse/widget.html`.
 * It renders the dashboard's `WidgetChartCard` from the widget definition
 * and rows in the tool result's `_meta.widget`.
 *
 * When the host proxies tool calls (`serverTools`), a toolbar above the card
 * offers the dashboard's time range picker and a refresh button. Both call
 * `renderWidget` again through the host with the original arguments, the
 * time window replaced, and render the latest call's result in place.
 */
export function WidgetApp() {
  const [result, setResult] = useState<ToolResult | null>(null);
  const [toolArguments, setToolArguments] = useState<ToolArguments | null>(
    null,
  );
  /** The time window of the call the view is waiting for. */
  const [pendingRange, setPendingRange] = useState<WidgetTimeRange | null>(
    null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Whether the host has had RESULT_WAIT_MS to send the tool result. */
  const [resultOverdue, setResultOverdue] = useState(false);
  /** Whether Retry already asked the chat for the chart again. */
  const [redrawAsked, setRedrawAsked] = useState(false);
  /** Cancels the running call when the user picks another window. */
  const runningCall = useRef<AbortController | null>(null);
  const { app, error } = useApp({
    appInfo: { name: "langfuse-widget", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (created) => {
      created.addEventListener("toolinput", (params) =>
        setToolArguments(params.arguments ?? {}),
      );
      created.addEventListener("toolresult", setResult);
      created.addEventListener("toolcancelled", ({ reason }) =>
        setResult(
          errorResult(
            reason
              ? `The chart was not drawn: the tool call was cancelled (${reason}).`
              : "The chart was not drawn: the tool call was cancelled.",
          ),
        ),
      );
      // A host sends the result once per view. A view that started again
      // (a reload, or a hot update in development) may never get it.
      setTimeout(() => setResultOverdue(true), RESULT_WAIT_MS);
    },
  });
  useHostStyles(app, app?.getHostContext());
  const theme = useDocumentTheme();

  const payload = result ? readPayload(result) : undefined;
  // Payloads from older versions of this view may lack the time window.
  const payloadRange =
    payload?.timeRange && typeof payload.timeRange === "object"
      ? payload.timeRange
      : undefined;
  const timeRange: WidgetTimeRange = pendingRange ??
    payloadRange ??
    (toolArguments && argumentsTimeRange(toolArguments)) ?? {
      range: DEFAULT_WIDGET_TIME_RANGE,
    };

  // The picker resets an unfinished calendar selection whenever its value
  // changes identity, so the value only changes with the window itself.
  const rangeKey = JSON.stringify(timeRange);
  const pickerTimeRange = useMemo(
    () => toPickerTimeRange(JSON.parse(rangeKey) as WidgetTimeRange),
    [rangeKey],
  );

  /**
   * Calls `renderWidget` through the host and renders its result. A call
   * still running is cancelled (the host is told), so only the latest
   * window renders.
   */
  const rerender = (nextRange: WidgetTimeRange) => {
    if (!app || !toolArguments) return;
    const nextArguments = withTimeRange(toolArguments, nextRange);
    runningCall.current?.abort();
    const call = new AbortController();
    runningCall.current = call;
    setPendingRange(nextRange);
    app
      .callServerTool(
        { name: RENDER_WIDGET_TOOL_NAME, arguments: nextArguments },
        { signal: call.signal },
      )
      .then((next) => {
        if (call.signal.aborted) return;
        setToolArguments(nextArguments);
        setResult(next);
        if (!next.isError) shareChartWithModel(app, next);
      })
      .catch((callError: unknown) => {
        if (call.signal.aborted) return;
        setResult(
          errorResult(
            callError instanceof Error
              ? callError.message
              : "The chart could not be refreshed",
          ),
        );
      })
      .finally(() => {
        if (runningCall.current !== call) return;
        runningCall.current = null;
        setPendingRange(null);
      });
  };

  // Replayed results may arrive without their arguments; without them, or
  // without a host that proxies tool calls, the chart stays static.
  const canRerender = Boolean(
    app?.getHostCapabilities()?.serverTools && toolArguments,
  );
  const interactive = canRerender && result !== null;
  const busy = pendingRange !== null;

  /** Posts the user's request for the chart to the chat, once. */
  const askToRedraw = () => {
    if (!app) return;
    setRedrawAsked(true);
    app
      .sendMessage({
        role: "user",
        content: [{ type: "text", text: REDRAW_REQUEST }],
      })
      .then((sent) => {
        if (sent.isError) setRedrawAsked(false);
      })
      .catch(() => setRedrawAsked(false));
  };

  const recovery: Recovery = (() => {
    if (canRerender) {
      return {
        kind: "rerender",
        onRetry: busy ? undefined : () => rerender(timeRange),
        hint: "Retry to draw it again.",
      };
    }
    if (redrawAsked) {
      return { kind: "none", hint: "Asked the assistant to draw it again." };
    }
    if (app?.getHostCapabilities()?.message) {
      return {
        kind: "ask",
        onRetry: askToRedraw,
        hint: "Retry to ask the assistant to draw it again.",
      };
    }
    return { kind: "none", hint: "Ask again to redraw it." };
  })();

  const content = (() => {
    if (error) {
      return (
        <WidgetChartCard
          title="Widget unavailable"
          content={{ type: "error", message: error.message }}
        />
      );
    }
    if (!result) {
      // A late result still replaces this card when it arrives.
      if (resultOverdue && !busy) {
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
      return (
        <WidgetChartCard
          title="Loading widget"
          content={{ type: "loading", progress: { type: "spinner" } }}
        />
      );
    }
    if (!payload) {
      return (
        <WidgetChartCard
          title="Widget unavailable"
          content={
            busy
              ? { type: "loading", progress: { type: "spinner" } }
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
  })();

  return (
    <div className={theme === "dark" ? "dark" : undefined}>
      {/* The host sizes the frame to the document, and the picker's popover
          floats outside it, so the frame grows while the popover is open. */}
      <div
        className={cn(
          "bg-background text-foreground",
          pickerOpen && "min-h-[520px]",
        )}
      >
        {interactive && (
          <div className="flex items-center gap-1 pb-2">
            <TimeRangePicker
              className="my-0 min-w-0"
              triggerClassName="px-2"
              timeRange={pickerTimeRange}
              timeRangePresets={DASHBOARD_AGGREGATION_OPTIONS}
              onTimeRangeChange={(next) => rerender(toWidgetTimeRange(next))}
              onOpenChange={setPickerOpen}
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
                onClick={() => rerender(timeRange)}
              />
            )}
          </div>
        )}
        {content}
      </div>
    </div>
  );
}
