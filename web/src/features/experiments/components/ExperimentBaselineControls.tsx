import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { X, ChevronDown } from "lucide-react";
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
  // Filter out current baseline from available options
  const availableForBaseline = experimentNames.filter((exp) =>
    baselineId ? exp.experimentId !== baselineId : true,
  );

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isLoading}>
            <span className="max-w-48 truncate">
              {baselineName ?? baselineId ?? "Select baseline..."}
            </span>
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto">
          {availableForBaseline.length > 0 ? (
            availableForBaseline.map((exp) => (
              <DropdownMenuItem
                key={exp.experimentId}
                onClick={() => onBaselineChange(exp.experimentId)}
              >
                <span className="truncate">{exp.experimentName}</span>
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>
              No other experiments available
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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
