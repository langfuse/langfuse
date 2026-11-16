import { Badge, BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { Metric } from "@/src/components/design-system/Metric/Metric";
import {
  type CategoricalDiff,
  type NumericDiff,
} from "@/src/features/datasets/lib/calculateBaselineDiff";

const getColor = (direction: "+" | "-", preferNegativeDirection: boolean) => {
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
  preferNegativeDiff = false,
  title,
  plain = false,
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
  /** Borderless and uncoloured, for dense tables that mark the direction elsewhere. */
  plain?: boolean;
}) {
  if (diff.type === "NUMERIC") {
    const value = `${diff.direction}${formatValue(diff.absoluteDifference)}`;
    // A number never truncates or wraps, so it carries no native tooltip
    // unless the caller names what the chip means.
    if (plain) {
      return (
        <Metric title={title}>
          <span className="whitespace-nowrap">{value}</span>
        </Metric>
      );
    }
    return (
      <BadgeShell
        color={getColor(diff.direction, preferNegativeDiff)}
        title={title}
      >
        <span className="whitespace-nowrap">{value}</span>
      </BadgeShell>
    );
  }
  if (diff.isDifferent) {
    /* Name the move when both sides are a single value: a categorical
       score going pass → fail is a diff, just not a number. */
    const move = diff.from && diff.to ? `${diff.from} → ${diff.to}` : "Varies";
    // A named move can be longer than the cell it sits in; the badge
    // truncates it and keeps the full move on hover.
    if (plain) return <Metric value={move} title={title ?? move} />;
    return <Badge color="warning" text={move} title={title ?? move} />;
  }
}
