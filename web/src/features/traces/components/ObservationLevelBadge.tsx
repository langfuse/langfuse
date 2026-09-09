import { type ComponentProps } from "react";
import { type ObservationLevelType } from "@langfuse/shared";

import { Badge } from "@/src/components/design-system/Badge/Badge";

type DisplayedObservationLevel = Exclude<ObservationLevelType, "DEFAULT">;

const observationLevelBadgeColors: Record<
  DisplayedObservationLevel,
  "neutral" | "yellow" | "red"
> = {
  DEBUG: "neutral",
  WARNING: "yellow",
  ERROR: "red",
};

export function ObservationLevelBadge({
  level,
  size,
}: {
  level: DisplayedObservationLevel;
  size: ComponentProps<typeof Badge>["size"];
}) {
  return (
    <Badge
      color={observationLevelBadgeColors[level]}
      size={size}
      text={level}
    />
  );
}
