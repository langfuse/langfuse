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
  /** Compact rows such as the trace tree use "sm". */
  size?: "sm" | "default";
}) {
  return (
    <Badge
      color={observationLevelBadgeColors[level]}
      size={size}
      text={level.charAt(0) + level.slice(1).toLowerCase()}
    />
  );
}
