import { Button } from "@/src/components/ui/button";
import { Combobox } from "@/src/components/ui/combobox";
import { X } from "lucide-react";
import { useExperimentNames } from "@/src/features/experiments/hooks/useExperimentNames";

type ExperimentBaselineControlsProps = {
  projectId: string;
  baselineId?: string;
  baselineName?: string;
  onBaselineChange: (id: string) => void;
  onBaselineClear: () => void;
  canClearBaseline?: boolean;
};

export function ExperimentBaselineControls({
  projectId,
  baselineId,
  baselineName,
  onBaselineChange,
  onBaselineClear,
  canClearBaseline = true,
}: ExperimentBaselineControlsProps) {
  const { experimentNames, isLoading } = useExperimentNames({
    projectId,
  });
  const baselineOptions = experimentNames.map((exp) => ({
    value: exp.experimentId,
    label: exp.experimentName,
  }));

  return (
    <div className="flex items-center gap-2">
      <div className="w-full">
        <Combobox
          options={baselineOptions}
          value={baselineId}
          onValueChange={onBaselineChange}
          placeholder={baselineName ?? baselineId ?? "Select baseline..."}
          emptyText="No experiments found"
          searchPlaceholder="Search experiments..."
          disabled={isLoading}
          className="h-9"
        />
      </div>

      {baselineId && canClearBaseline && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onBaselineClear}
          disabled={isLoading}
          title="Clear baseline"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
