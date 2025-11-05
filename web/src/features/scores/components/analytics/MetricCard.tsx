import { Badge } from "@/src/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import type { InterpretationResult } from "@/src/features/scores/lib/statistics-utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  interpretation?: InterpretationResult;
  helpText?: string;
  isPlaceholder?: boolean;
}

/**
 * MetricCard component for displaying individual statistical metrics
 * Supports optional interpretation badges and help tooltips
 * Follows the existing analytics card pattern with text-sm labels and text-2xl values
 */
export function MetricCard({
  label,
  value,
  interpretation,
  helpText,
  isPlaceholder = false,
}: MetricCardProps) {
  const displayValue = isPlaceholder ? "--" : value;

  // Map interpretation color to badge variant
  const getBadgeVariant = (color: string) => {
    switch (color) {
      case "green":
        return "default"; // Green is default in most badge systems
      case "blue":
        return "secondary";
      case "yellow":
        return "outline";
      case "orange":
        return "outline";
      case "red":
        return "destructive";
      case "gray":
      default:
        return "outline";
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Label with optional help icon */}
      <div className="flex items-center gap-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        {helpText && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3 w-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs">{helpText}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Value with interpretation badge */}
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-semibold">{displayValue}</p>
        {interpretation &&
          !isPlaceholder &&
          interpretation.strength !== "N/A" && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant={getBadgeVariant(interpretation.color)}>
                    {interpretation.strength}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">{interpretation.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
      </div>
    </div>
  );
}
