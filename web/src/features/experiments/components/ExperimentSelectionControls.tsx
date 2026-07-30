import { ExperimentBaselineControls } from "./ExperimentBaselineControls";
import { ExperimentComparisonSelector } from "./ExperimentComparisonSelector";

type ExperimentSelectionControlsProps = {
  projectId: string;
  baselineId?: string;
  baselineName?: string;
  comparisonIds: string[];
  onBaselineChange: (id: string) => void;
  onBaselineClear: () => void;
  onComparisonIdsChange: (ids: string[]) => void;
};

export function ExperimentSelectionControls({
  projectId,
  baselineId,
  baselineName,
  comparisonIds,
  onBaselineChange,
  onBaselineClear,
  onComparisonIdsChange,
}: ExperimentSelectionControlsProps) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="w-56 min-w-0">
        <div className="text-muted-foreground mb-1 text-xs">Baseline</div>
        <ExperimentBaselineControls
          projectId={projectId}
          baselineId={baselineId}
          baselineName={baselineName}
          onBaselineChange={onBaselineChange}
          onBaselineClear={onBaselineClear}
          canClearBaseline={comparisonIds.length > 0}
        />
      </div>

      <div className="w-80 min-w-0">
        <div className="text-muted-foreground mb-1 text-xs">Compare with</div>
        <ExperimentComparisonSelector
          projectId={projectId}
          baselineExperimentId={baselineId}
          selectedIds={comparisonIds}
          onSelectedIdsChange={onComparisonIdsChange}
        />
      </div>
    </div>
  );
}
