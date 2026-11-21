import { useState } from "react";
import {
  useApp,
  useDocumentTheme,
  useHostStyles,
  type McpUiToolResultNotification,
} from "@modelcontextprotocol/ext-apps/react";
import { WidgetChartCard } from "@/src/features/widgets/components/WidgetChartCard";
import { toChartProps, type WidgetPayload } from "./toChartProps";

type ToolResult = McpUiToolResultNotification["params"];

const readPayload = (result: ToolResult): WidgetPayload | undefined => {
  const widget = (result._meta as { widget?: WidgetPayload } | undefined)
    ?.widget;
  return widget?.chartType ? widget : undefined;
};

const resultText = (result: ToolResult) =>
  result.content?.find((block) => block.type === "text")?.text;

/**
 * The `renderWidget` MCP App view, inlined into `ui://langfuse/widget.html`.
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
    return (
      <WidgetChartCard
        {...toChartProps(payload)}
        title={payload.title}
        description={payload.description ?? payload.timeRangeLabel}
      />
    );
  })();

  return (
    <div className={theme === "dark" ? "dark" : undefined}>
      <div className="bg-background text-foreground">{content}</div>
    </div>
  );
}
