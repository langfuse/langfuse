import { Badge } from "@/src/components/ui/badge";
import {
  type CategoricalDiff,
  type NumericDiff,
} from "@/src/features/datasets/lib/calculateBaselineDiff";
import { cn } from "@/src/utils/tailwind";

const getVariant = (direction: "+" | "-", preferNegativeDirection: boolean) => {
  if (preferNegativeDirection) {
    return direction === "-" ? "success" : "error";
  }
  return direction === "+" ? "success" : "error";
};

/**
 * Displays a diff value with color coding
 * Used for scores, latency, and cost diffs in compare view
 */
export function DiffLabel({
  diff,
  formatValue,
  className,
  preferNegativeDiff = false,
}: {
  diff: NumericDiff | CategoricalDiff;
  formatValue: (value: number) => string;
  className?: string;
  preferNegativeDiff?: boolean;
}) {
  if (diff.type === "NUMERIC") {
    return (
      <Badge
        size="sm"
        variant={getVariant(diff.direction, preferNegativeDiff)}
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
