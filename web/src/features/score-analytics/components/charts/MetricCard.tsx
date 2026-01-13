import { Badge } from "@/src/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { HelpCircle, AlertCircle } from "lucide-react";
import type { InterpretationResult } from "@/src/features/score-analytics/lib/statistics-utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  interpretation?: InterpretationResult;
  helpText?: string;
  warning?: {
    show: boolean;
    content: React.ReactNode;
  };
  isPlaceholder?: boolean;
  isContext?: boolean; // Data context metrics (counts) vs analysis metrics (statistics)
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
  warning,
  isPlaceholder = false,
  isContext = false,
}: MetricCardProps) {
  // Handle N/A values - check if value is string "N/A"
  const isNA = value === "N/A";
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
    <div className="flex flex-col gap-0.5">
      {/* Label with optional help icon */}
      <div className="flex items-center gap-1">
        <p className="text-xs text-muted-foreground">{label}</p>
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
      <div className="flex items-center gap-2">
        {isNA ? (
          // Muted styling for N/A values - use em dash and reduced opacity
          <span className="text-sm text-muted-foreground/50">—</span>
        ) : (
          // Normal styling for actual values
          <p
            className={
              isContext ? "text-lg font-semibold" : "text-lg font-semibold"
            }
          >
            {displayValue}
          </p>
        )}
        {interpretation &&
          !isPlaceholder &&
          !isNA &&
          interpretation.strength !== "N/A" && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant={getBadgeVariant(interpretation.color)}
                    className="px-1.5 py-0 text-[10px] font-normal opacity-70"
                  >
                    {interpretation.strength}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">{interpretation.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        {warning?.show && !isPlaceholder && !isNA && (
          <HoverCard>
            <HoverCardTrigger asChild>
              <AlertCircle className="h-4 w-4 cursor-help text-amber-500" />
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              {warning.content}
            </HoverCardContent>
          </HoverCard>
        )}
      </div>
    </div>
  );
}
