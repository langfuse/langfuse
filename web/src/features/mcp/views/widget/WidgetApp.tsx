import { useState } from "react";
import { ErrorBoundary } from "@sentry/nextjs";
import {
  useApp,
  useDocumentTheme,
  useHostStyles,
  type McpUiToolResultNotification,
} from "@modelcontextprotocol/ext-apps/react";
import { WidgetChartCard } from "@/src/features/widgets/components/WidgetChartCard";
import { type WidgetPayload } from "../../core/widget-payload";
import { toChartProps } from "./toChartProps";

type ToolResult = McpUiToolResultNotification["params"];

const readPayload = (result: ToolResult): WidgetPayload | undefined => {
  const widget = (result._meta as { widget?: WidgetPayload } | undefined)
    ?.widget;
  return widget?.chartType ? widget : undefined;
};

const resultText = (result: ToolResult) =>
  result.content?.find((block) => block.type === "text")?.text;

/**
 * Hosts keep tool results and replay them into a fresh view, so an old
 * conversation can hand this view a payload that a newer widget version no
 * longer reads. Asking again renders it from the current definition.
 */
const STALE_WIDGET_MESSAGE =
  "This chart can no longer be shown. Ask again to redraw it.";

const staleWidgetCard = (
  <WidgetChartCard
    title="Widget unavailable"
    content={{ type: "error", message: STALE_WIDGET_MESSAGE }}
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
function WidgetChart({ payload }: { payload: WidgetPayload }) {
  const chartProps = tryChartProps(payload);
  if (!chartProps) return staleWidgetCard;
  return (
    <ErrorBoundary fallback={staleWidgetCard}>
      <WidgetChartCard
        {...chartProps}
        title={payload.name}
        description={payload.description || payload.timeRangeLabel}
      />
    </ErrorBoundary>
  );
}

/**
 * The `renderWidget` MCP App view, the page behind `ui://langfuse/widget.html`.
 * It renders the dashboard's `WidgetChartCard` from the widget definition
 * and rows in the tool result's `_meta.widget`.
 */
export function WidgetApp() {
  const [result, setResult] = useState<ToolResult | null>(null);
  const { app, error } = useApp({
    appInfo: { name: "langfuse-widget", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (created) => {
      created.addEventListener("toolresult", setResult);
    },
  });
  useHostStyles(app, app?.getHostContext());
  const theme = useDocumentTheme();

  const payload = result ? readPayload(result) : undefined;
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
          content={{
            type: "error",
            message:
              (result.isError && resultText(result)) ||
              "No widget data in the tool result",
          }}
        />
      );
    }
    return <WidgetChart payload={payload} />;
  })();

  return (
    <div className={theme === "dark" ? "dark" : undefined}>
      <div className="bg-background text-foreground">{content}</div>
    </div>
  );
}
