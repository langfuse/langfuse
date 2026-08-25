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
      className: "border-dark-yellow/40 bg-light-yellow",
      backgroundColor: "var(--light-yellow)",
    };
  }

  if (level === "DEBUG") {
    return {
      title: "Debug",
      className: "border-muted-foreground/15 bg-muted/30 text-muted-foreground",
      backgroundColor: "hsl(var(--muted) / 0.3)",
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
