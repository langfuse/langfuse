import { Badge, BadgeShell } from "@/src/components/design-system/Badge/Badge";
import {
  type CategoricalDiff,
  type NumericDiff,
} from "@/src/features/datasets/lib/calculateBaselineDiff";
import { type ComponentProps } from "react";

const getColor = (direction: "+" | "-", preferNegativeDirection: boolean) => {
  if (preferNegativeDirection) {
    return direction === "-" ? "green" : "red";
  }
  return direction === "+" ? "green" : "red";
};

/**
 * Displays a diff value with color coding
 * Used for scores, latency, and cost diffs in compare view
 */
export function DiffLabel({
  diff,
  formatValue,
  preferNegativeDiff = false,
  title,
  variant,
}: {
  diff: NumericDiff | CategoricalDiff;
  formatValue: (value: number) => string;
  preferNegativeDiff?: boolean;
  /**
   * What the chip means, on hover. `+0.07` and `a → b` do not say which side
   * is which; a caller that knows the two sides should say it
   * (`describeRunComparison`). Falls back to the chip's own text.
   */
  title?: string;
  variant?: ComponentProps<typeof Badge>["color"];
}) {
  if (diff.type === "NUMERIC") {
    // A number never truncates, so it carries no native tooltip unless the
    // caller names what the chip means.
    return (
      <BadgeShell
        color={variant ?? getColor(diff.direction, preferNegativeDiff)}
        title={title}
      >
        {diff.direction}
        {formatValue(diff.absoluteDifference)}
      </BadgeShell>
    );
  }
  if (diff.isDifferent) {
    /* Name the move when both sides are a single value: a categorical
       score going pass → fail is a diff, just not a number. */
    const move = diff.from && diff.to ? `${diff.from} → ${diff.to}` : "Varies";
    // A named move can be longer than the cell it sits in; the badge
    // ellipsises it and keeps the full move on hover.
    return (
      <Badge color={variant ?? "yellow"} text={move} title={title ?? move} />
    );
  }
}
