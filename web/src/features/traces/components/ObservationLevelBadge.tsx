import { type ObservationLevelType } from "@langfuse/shared";

import { Badge } from "@/src/components/design-system/Badge/Badge";

type DisplayedObservationLevel = Exclude<ObservationLevelType, "DEFAULT">;

const observationLevelBadgeColors: Record<
  DisplayedObservationLevel,
  "warning" | "error" | undefined
> = {
  DEBUG: undefined,
  WARNING: "warning",
  ERROR: "error",
};

export function ObservationLevelBadge({
  level,
}: {
  level: DisplayedObservationLevel;
}) {
  return (
    <Badge
      color={observationLevelBadgeColors[level]}
      size="md"
      text={level.charAt(0) + level.slice(1).toLowerCase()}
    />
  );
}
