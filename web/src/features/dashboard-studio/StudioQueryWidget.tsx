import { type FilterState, type StudioWidgetConfig } from "@langfuse/shared";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import { useStudioQueryView } from "./useStudioQueryView";
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
  const { displayed, picker } = useStudioQueryView(config, "dashboard");
  const runtime = useStudioWidgetResult(displayed, {
    projectId,
    readPath,
    dateRange,
    filterState,
  });
  const prepared = prepareStudioChart(runtime.result.data, displayed);
  return (
    <StudioWidgetResultView
      config={displayed}
      runtime={runtime}
      prepared={prepared}
      actions={actions}
      onHiddenSeriesChange={onHiddenSeriesChange}
      queryView={picker}
    />
  );
}
