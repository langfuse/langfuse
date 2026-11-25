import { useState } from "react";
import {
  normalizeStudioWidget,
  type FilterState,
  type StudioSavedWidgetConfig,
} from "@langfuse/shared";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import { prepareStudioChart } from "./prepareStudioChart";
import { useStudioWidgetResult } from "./useStudioWidgetResult";
import { StudioWidgetResultView } from "./StudioWidgetResultView";
import { useDashboardStudioCapture } from "./analytics";

export type StudioQueryWidgetProps = {
  projectId: string;
  config: StudioSavedWidgetConfig;
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  actions?: DataCardActions;
  onTabChange?: (id: string) => void;
};

export function StudioQueryWidget({
  config,
  actions,
  onTabChange,
  ...context
}: StudioQueryWidgetProps) {
  const widget = normalizeStudioWidget(config);
  const [selected, setSelected] = useState<string>();
  const [hiddenByTab, setHiddenByTab] = useState<Record<string, string[]>>({});
  const tab =
    widget.tabs.find((item) => item.id === selected) ?? widget.tabs[0]!;
  const hidden = hiddenByTab[tab.id];
  const chart = hidden
    ? {
        ...tab.chart,
        display: { ...tab.chart.display, hiddenSeriesIds: hidden },
      }
    : tab.chart;
  const track = useDashboardStudioCapture(context.readPath === "v4");
  const runtime = useStudioWidgetResult(tab.chart, context);
  const prepared = prepareStudioChart(runtime.result.data, chart);
  return (
    <StudioWidgetResultView
      key={tab.id}
      title={widget.title}
      config={chart}
      onHiddenSeriesChange={(ids) =>
        setHiddenByTab((prev) => ({ ...prev, [tab.id]: ids }))
      }
      runtime={runtime}
      prepared={prepared}
      actions={actions}
      tabs={
        widget.tabs.length > 1
          ? {
              value: tab.id,
              options: widget.tabs.map((item) => ({
                value: item.id,
                label: item.chart.title,
              })),
              onValueChange: (id) => {
                setSelected(id);
                onTabChange?.(id);
                track("view_changed", {
                  scope: "widget",
                  target: "chart",
                  widgetKind: "query",
                });
              },
            }
          : undefined
      }
    />
  );
}
