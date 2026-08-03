import { ExperimentBaselineControls } from "./ExperimentBaselineControls";
import { ExperimentComparisonSelector } from "./ExperimentComparisonSelector";

type ExperimentSelectionControlsProps = {
  projectId: string;
  baselineId?: string;
  baselineName?: string;
  comparisonIds: string[];
  selectedExperimentCount: number;
  onBaselineChange: (id: string) => void;
  onBaselineClear: () => void;
  onComparisonIdsChange: (ids: string[]) => void;
};

export function ExperimentSelectionControls({
  projectId,
  baselineId,
  baselineName,
  comparisonIds,
  selectedExperimentCount,
  onBaselineChange,
  onBaselineClear,
  onComparisonIdsChange,
}: ExperimentSelectionControlsProps) {
  return (
    <div className="flex w-[50dvw] min-w-0 flex-row gap-3">
      <div className="flex min-w-0 items-center">
        <div className="border-input bg-muted/30 flex h-8 w-auto shrink-0 items-center rounded-l-md border px-3 text-xs">
          Baseline
        </div>
        <div className="w-full max-w-64 min-w-0 flex-1">
          <ExperimentBaselineControls
            projectId={projectId}
            baselineId={baselineId}
            baselineName={baselineName}
            onBaselineChange={onBaselineChange}
            onBaselineClear={onBaselineClear}
          />
        </div>
      </div>

      <div className="flex min-w-0 items-center">
        <div className="border-input bg-muted/30 flex h-8 w-auto shrink-0 items-center rounded-l-md border px-3 text-xs">
          Experiment selection
        </div>
        <div className="w-full max-w-64 min-w-0 flex-1">
          <ExperimentComparisonSelector
            projectId={projectId}
            baselineExperimentId={baselineId}
            selectedIds={comparisonIds}
            selectedExperimentCount={selectedExperimentCount}
            onSelectedIdsChange={onComparisonIdsChange}
          />
        </div>
      </div>
    </div>
  );
}
