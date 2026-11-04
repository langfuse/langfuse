/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { type ComponentProps } from "react";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { HelpCircle, AlertCircle } from "@langfuse/icons";
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
  const getBadgeColor = (
    color: string,
  ): ComponentProps<typeof Badge>["color"] => {
    switch (color) {
      case "green":
        return "inverted";
      case "blue":
        return "filled";
      case "red":
        return "red";
      case "yellow":
      case "orange":
      case "gray":
      default:
        return "primary";
    }
  };

  return (
    <div className="flex flex-col gap-0.5">
      {/* Label with optional help icon */}
      <div className="flex items-center gap-1">
        <p className="text-muted-foreground text-xs">{label}</p>
        {helpText && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle size="sm" color="muted" />
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
          <span className="text-muted-foreground/50 text-sm">—</span>
        ) : (
          // Normal styling for actual values
          <p className={isContext ? "text-lg font-bold" : "text-lg font-bold"}>
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
                    color={getBadgeColor(interpretation.color)}
                    size="sm"
                    text={interpretation.strength}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">{interpretation.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        {warning?.show && !isPlaceholder && !isNA && (
          <HoverCard
            content={<div className="w-80 p-3">{warning.content}</div>}
          >
            {({ getTriggerProps }) => (
              <span tabIndex={0} {...getTriggerProps()}>
                <AlertCircle
                  size="base"
                  __rawClassName="cursor-help text-amber-500"
                />
              </span>
            )}
          </HoverCard>
        )}
      </div>
    </div>
  );
}
