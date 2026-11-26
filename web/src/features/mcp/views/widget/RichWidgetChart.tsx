import { useState } from "react";
import {
  multiQueryTabAsChart,
  normalizeMultiQueryConfig,
} from "@langfuse/shared/dashboards";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { TabBar } from "@/src/components/design-system/TabBar/TabBar";
import { DashboardMarkdown } from "@/src/features/dashboard-blocks/DashboardMarkdown";
import { MultiQueryResultView } from "@/src/features/dashboard-blocks/multi-query/MultiQueryResultView";
import { applyMultiQueryFormulas } from "@/src/features/dashboard-blocks/multi-query/multiQueryFormulas";
import { WidgetChartCard } from "@/src/features/widgets/components/WidgetChartCard";
import { type WidgetPayload } from "../../core/widget-payload";

export function RichWidgetChart({
  payload,
  rich,
  loading,
  canChangeTab,
  onSelectTab,
  onRefresh,
}: {
  payload: WidgetPayload;
  rich: NonNullable<WidgetPayload["rich"]>;
  loading: boolean;
  canChangeTab: boolean;
  onSelectTab: (id: string) => void;
  onRefresh: () => void;
}) {
  const [hiddenByTab, setHiddenByTab] = useState<Record<string, Set<string>>>(
    {},
  );
  if (rich.definition.kind === "markdown")
    return (
      <DashboardMarkdown
        title={rich.definition.config.title}
        content={rich.definition.config.content}
      />
    );
  const config = normalizeMultiQueryConfig(rich.definition.config);
  const tab =
    config.tabs.find((tab) => tab.id === rich.activeTabId) ?? config.tabs[0]!;
  const raw = rich.result;
  if (!raw)
    return (
      <WidgetChartCard
        title={config.title}
        content={{
          type: "error",
          message: "The chart data is missing. Refresh to load it.",
          onRetry: onRefresh,
        }}
      />
    );
  const result = applyMultiQueryFormulas(tab, raw, "v4");
  const plot = loading ? (
    <WidgetChartCard
      title={tab.label}
      content={{ type: "loading", progress: { type: "spinner" } }}
    />
  ) : (
    <div className="flex h-[440px] min-h-0 flex-col">
      <MultiQueryResultView
        config={multiQueryTabAsChart(tab)}
        runtime={{
          result,
          hiddenSeries: hiddenByTab[tab.id] ?? new Set(),
          toggleSeries: (id) =>
            setHiddenByTab((previous) => {
              const next = new Set(previous[tab.id]);
              if (!next.delete(id)) next.add(id);
              return { ...previous, [tab.id]: next };
            }),
          isV4: true,
          validationError: null,
          refresh: onRefresh,
          hasVisibleMetrics:
            tab.queries.some(
              (source) =>
                !source.hidden &&
                source.metrics.some((metric) => !metric.hidden),
            ) || Boolean(tab.formulas?.some((formula) => !formula.hidden)),
          plan: { queries: [], warnings: rich.warnings ?? [] },
        }}
      />
    </div>
  );
  return (
    <section
      aria-label={config.title}
      className="bg-background ph-no-capture flex min-h-0 flex-col gap-2 rounded-lg border p-4"
    >
      <h3 className="text-base font-bold">{config.title}</h3>
      <p className="text-muted-foreground text-sm">
        {config.description || payload.timeRangeLabel}
      </p>
      {config.tabs.length > 1 ? (
        <Tabs value={tab.id} onValueChange={onSelectTab}>
          <TabBar
            label="Widget tabs"
            tabs={config.tabs.map(({ id, label }) => ({
              value: id,
              label,
              disabled: loading || !canChangeTab,
              noCapture: true,
            }))}
          />
          <Tabs.Content value={tab.id}>{plot}</Tabs.Content>
        </Tabs>
      ) : (
        plot
      )}
      {!canChangeTab && config.tabs.length > 1 ? (
        <p className="text-muted-foreground text-sm">
          Ask the assistant to render another tab; this chat host does not
          support interactive tool calls.
        </p>
      ) : null}
    </section>
  );
}
