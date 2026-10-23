import { Badge } from "@/src/components/design-system/Badge/Badge";

export const SLOWEST_BADGE_TEXT = "slowest";

/** Marks the one observation in a trace with the most self time. */
export function SlowestBadge() {
  return (
    <Badge
      color="yellow"
      size="md"
      font="mono"
      text={SLOWEST_BADGE_TEXT}
      title="Most self time in this trace: own duration minus its children's"
    />
  );
}
