import { useState } from "react";
import { type FilterState, type StudioWidgetConfig } from "@langfuse/shared";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import { prepareStudioChart } from "./prepareStudioChart";
import { useStudioWidgetResult } from "./useStudioWidgetResult";
import { StudioWidgetResultView } from "./StudioWidgetResultView";

export type StudioQueryWidgetProps = {
  projectId: string;
  config: StudioWidgetConfig;
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  actions?: DataCardActions;
  onHiddenSeriesChange?: (ids: string[]) => void;
};

export function StudioQueryWidget({
  projectId,
  config,
  readPath,
  dateRange,
  filterState,
  actions,
  onHiddenSeriesChange,
}: StudioQueryWidgetProps) {
  const [selectedQuery, setSelectedQuery] = useState("configured");
  const selection =
    selectedQuery === "all" ||
    config.queries.some((query) => query.id === selectedQuery)
      ? selectedQuery
      : "configured";
  const effectiveConfig =
    selection === "configured"
      ? config
      : {
          ...config,
          display: {
            ...config.display,
            activeQueryIds: selection === "all" ? undefined : [selection],
          },
        };
  const runtime = useStudioWidgetResult(effectiveConfig, {
    projectId,
    readPath,
    dateRange,
    filterState,
  });
  const prepared = prepareStudioChart(runtime.result.data, effectiveConfig);
  return (
    <StudioWidgetResultView
      config={effectiveConfig}
      runtime={runtime}
      prepared={prepared}
      actions={actions}
      onHiddenSeriesChange={onHiddenSeriesChange}
      queryView={{
        value: selection,
        onChange: setSelectedQuery,
        configuredQueryIds: config.display.activeQueryIds,
      }}
    />
  );
}
