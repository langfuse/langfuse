import { type ObservationLevelType } from "@langfuse/shared";

export const LevelColors = {
  DEFAULT: { text: "", bg: "" },
  DEBUG: { text: "text-muted-foreground", bg: "bg-tertiary" },
  WARNING: { text: "text-dark-yellow", bg: "bg-light-yellow" },
  ERROR: { text: "text-dark-red", bg: "bg-light-red" },
};

export const LevelSymbols = {
  DEFAULT: "ℹ️",
  DEBUG: "🔍",
  WARNING: "⚠️",
  ERROR: "🚨",
};

export const formatAsLabel = (countLabel: string) => {
  return countLabel.replace(/Count$/, "").toUpperCase() as ObservationLevelType;
};
