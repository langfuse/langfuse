import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { X, ChevronDown } from "lucide-react";
import { type ExperimentOption } from "./ExperimentComparisonSelector";

type ExperimentBaselineControlsProps = {
  baselineId: string;
  baselineName?: string;
  availableExperiments: ExperimentOption[];
  onBaselineChange: (id: string) => void;
  onBaselineClear: () => void;
  isLoading?: boolean;
};

export function ExperimentBaselineControls({
  baselineId,
  baselineName,
  availableExperiments,
  onBaselineChange,
  onBaselineClear,
  isLoading = false,
}: ExperimentBaselineControlsProps) {
  // Filter out current baseline from available options
  const availableForBaseline = availableExperiments.filter(
    (exp) => exp.id !== baselineId,
  );

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isLoading}>
            <span className="max-w-48 truncate">
              {baselineName ?? baselineId}
            </span>
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto">
          {availableForBaseline.length > 0 ? (
            availableForBaseline.map((exp) => (
              <DropdownMenuItem
                key={exp.id}
                onClick={() => onBaselineChange(exp.id)}
              >
                <span className="truncate">{exp.name}</span>
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>
              No other experiments available
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="sm"
        onClick={onBaselineClear}
        disabled={isLoading}
        title="Clear baseline"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
