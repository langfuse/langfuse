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
  size?: "sm";
}) {
  return (
    <Badge
      color={observationLevelBadgeColors[level]}
      size={size}
      text={level}
    />
  );
}
