import { Badge } from "@/src/components/ui/badge";
import {
  type CategoricalDiff,
  type NumericDiff,
} from "@/src/features/datasets/lib/calculateBaselineDiff";
import { cn } from "@/src/utils/tailwind";

/**
 * Displays a diff value with color coding
 * Used for scores, latency, and cost diffs in compare view
 */
export function DiffLabel({
  diff,
  formatValue,
  className,
  invertColors,
}: {
  diff: NumericDiff | CategoricalDiff;
  formatValue: (value: number) => string;
  className?: string;
  invertColors?: boolean;
}) {
  if (diff.type === "NUMERIC") {
    let variant: "success" | "error";
    if (invertColors) {
      // Lower is better (cost/latency)
      variant = diff.direction === "+" ? "error" : "success";
    } else {
      // Higher is better (scores)
      variant = diff.direction === "+" ? "success" : "error";
    }
    return (
      <Badge
        size="sm"
        variant={variant}
        className={cn("font-semibold", className)}
      >
        {diff.direction}
        {formatValue(diff.absoluteDifference)}
      </Badge>
    );
  }
  if (diff.isDifferent)
    return (
      <Badge size="sm" variant="warning" className="font-semibold">
        Varies
      </Badge>
    );
}
