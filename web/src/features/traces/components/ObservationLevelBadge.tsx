import { type ObservationLevelType } from "@langfuse/shared";

import { Badge } from "@/src/components/design-system/Badge/Badge";

type DisplayedObservationLevel = Exclude<ObservationLevelType, "DEFAULT">;

const observationLevelBadgeColors: Record<
  DisplayedObservationLevel,
  "yellow" | "red" | undefined
> = {
  DEBUG: undefined,
  WARNING: "yellow",
  ERROR: "red",
};

export function ObservationLevelBadge({
  level,
  size,
}: {
  level: DisplayedObservationLevel;
  /** Tree rows use "md" to match the score chips beside them. */
  size?: "md" | "default";
}) {
  return (
    <Badge
      color={observationLevelBadgeColors[level]}
      size={size}
      text={level.charAt(0) + level.slice(1).toLowerCase()}
    />
  );
}
