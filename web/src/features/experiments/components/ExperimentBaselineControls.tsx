import { Button } from "@/src/components/ui/button";
import { Combobox } from "@/src/components/ui/combobox";
import { X } from "lucide-react";
import { useExperimentNames } from "@/src/features/experiments/hooks/useExperimentNames";
import { cn } from "@/src/utils/tailwind";

type ExperimentBaselineControlsProps = {
  projectId: string;
  baselineId?: string;
  baselineName?: string;
  onBaselineChange: (id: string) => void;
  onBaselineClear: () => void;
};

export function ExperimentBaselineControls({
  projectId,
  baselineId,
  baselineName,
  onBaselineChange,
  onBaselineClear,
}: ExperimentBaselineControlsProps) {
  const { experimentNames, isLoading } = useExperimentNames({
    projectId,
  });
  const baselineOptions = experimentNames.map((exp) => ({
    value: exp.experimentId,
    label: exp.experimentName,
  }));

  return (
    <div className="flex min-w-0 items-center">
      <div className="min-w-0 flex-1">
        <Combobox
          options={baselineOptions}
          value={baselineId}
          onValueChange={onBaselineChange}
          placeholder={baselineName ?? baselineId ?? "Select baseline..."}
          emptyText="No experiments found"
          searchPlaceholder="Search experiments..."
          disabled={isLoading}
          className={cn(
            "rounded-l-none border-l-0",
            baselineId && "rounded-r-none",
          )}
        />
      </div>

      {baselineId && (
        <Button
          variant="outline"
          size="icon"
          className="-ml-px shrink-0 rounded-l-none"
          onClick={onBaselineClear}
          disabled={isLoading}
          title="Clear baseline"
          aria-label="Clear baseline"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
