/* eslint-disable @repo/no-style-props */
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
  title,
}: {
  diff: NumericDiff | CategoricalDiff;
  formatValue: (value: number) => string;
  className?: string;
  preferNegativeDiff?: boolean;
  /**
   * What the chip means, on hover. `+0.07` and `a → b` do not say which side
   * is which; a caller that knows the two sides should say it
   * (`describeRunComparison`). Falls back to the chip's own text.
   */
  title?: string;
}) {
  if (diff.type === "NUMERIC") {
    return (
      <Badge
        size="sm"
        variant={getVariant(diff.direction, preferNegativeDiff)}
        className={cn("font-bold", className)}
        title={title}
      >
        {diff.direction}
        {formatValue(diff.absoluteDifference)}
      </Badge>
    );
  }
  if (diff.isDifferent) {
    /* Name the move when both sides are a single value: a categorical
       score going pass → fail is a diff, just not a number. */
    const move = diff.from && diff.to ? `${diff.from} → ${diff.to}` : "Varies";
    return (
      <Badge
        size="sm"
        variant="warning"
        // A named move can be longer than the cell it sits in, and the value it
        // qualifies matters more than the move does — so shrink and ellipsise
        // here rather than clipping mid-word, and keep the full move on hover.
        className={cn("min-w-0 truncate font-bold", className)}
        title={title ?? move}
      >
        {move}
      </Badge>
    );
  }
}
