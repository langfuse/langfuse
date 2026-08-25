import type { ObservationLevelType } from "@langfuse/shared";
import { assertUnreachable } from "@/src/utils/types";

export interface ObservationStatusMessage {
  level: ObservationLevelType;
  message: string;
}

export function getStatusMessagePresentation(level: ObservationLevelType) {
  if (level === "ERROR") {
    return {
      title: "Error",
      className: "border-dark-red bg-light-red",
      backgroundColor: "var(--light-red)",
    };
  }

  if (level === "WARNING") {
    return {
      title: "Warning",
      className: "border-dark-yellow bg-light-yellow",
      backgroundColor: "var(--light-yellow)",
    };
  }

  if (level === "DEBUG") {
    return {
      title: "Debug",
      className: "border-muted-foreground/30 bg-tertiary",
      backgroundColor: "hsl(var(--tertiary))",
    };
  }

  if (level === "DEFAULT") {
    return {
      title: "Status",
      className: "bg-card",
      backgroundColor: "hsl(var(--card))",
    };
  }

  return assertUnreachable(level);
}
