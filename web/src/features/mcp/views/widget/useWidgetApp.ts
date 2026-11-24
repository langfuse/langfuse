import { useRef, useState } from "react";
import {
  useApp,
  useHostStyles,
  type App,
  type McpUiToolResultNotification,
} from "@modelcontextprotocol/ext-apps/react";
import { RENDER_WIDGET_TOOL_NAME } from "../../core/widget-payload";
import { type WidgetTimeRange } from "../../core/widget-time-ranges";
import { withTimeRange } from "./timeRanges";

export type ToolResult = McpUiToolResultNotification["params"];
type ToolArguments = Record<string, unknown>;

/**
 * How long the view waits for the host's tool result before it offers Retry.
 * Long enough for a slow chart query, which the host sends when it finishes.
 */
const RESULT_WAIT_MS = 30_000;

/** The message the chat gets when the user retries a chart without its arguments. */
const REDRAW_REQUEST =
  "The Langfuse chart above did not load. Please draw it again with renderWidget.";

export const resultText = (result: ToolResult) =>
  result.content?.find((block) => block.type === "text")?.text;

const errorResult = (message: string): ToolResult => ({
  isError: true,
  content: [{ type: "text", text: message }],
});

const cancelledResult = (reason: string | undefined) =>
  errorResult(
    reason
      ? `The chart was not drawn: the tool call was cancelled (${reason}).`
      : "The chart was not drawn: the tool call was cancelled.",
  );

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
 * The view's connection to the host: the `renderWidget` call's arguments and
 * result as the host sends them, and the calls the view makes itself.
 *
 * - `rerender` calls `renderWidget` again through the host with the call's
 *   arguments and another window. A call still running is cancelled (the
 *   host is told), so only the latest window renders.
 * - `askToRedraw` posts the user's request for the chart to the chat, for a
 *   view that has no arguments to call with.
 */
export function useWidgetApp() {
  const [result, setResult] = useState<ToolResult | null>(null);
  const [toolArguments, setToolArguments] = useState<ToolArguments | null>(
    null,
  );
  /** The time window of the call the view is waiting for. */
  const [pendingRange, setPendingRange] = useState<WidgetTimeRange | null>(
    null,
  );
  /** Whether the host has had RESULT_WAIT_MS to send the tool result. */
  const [resultOverdue, setResultOverdue] = useState(false);
  /** Whether the chat was already asked for the chart again. */
  const [redrawAsked, setRedrawAsked] = useState(false);
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
        setResult(cancelledResult(reason)),
      );
      // A host sends the result once per view. A view that started again
      // (a reload, or a hot update in development) may never get it.
      setTimeout(() => setResultOverdue(true), RESULT_WAIT_MS);
    },
  });
  useHostStyles(app, app?.getHostContext());

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
        // The picker and Retry keep the window that failed.
        setToolArguments(nextArguments);
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

  const hostCapabilities = app?.getHostCapabilities();
  return {
    error,
    result,
    toolArguments,
    pendingRange,
    resultOverdue,
    redrawAsked,
    /**
     * Whether the view can call `renderWidget` itself. Replayed results may
     * arrive without their arguments, and some hosts proxy no tool calls.
     */
    canRerender: Boolean(hostCapabilities?.serverTools && toolArguments),
    canAskInChat: Boolean(hostCapabilities?.message),
    rerender,
    askToRedraw,
  };
}

export type WidgetAppState = ReturnType<typeof useWidgetApp>;
