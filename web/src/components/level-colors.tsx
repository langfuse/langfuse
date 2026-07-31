import type React from "react";
import { type ObservationLevelType } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";

export const LevelColors = {
  DEFAULT: { text: "", bg: "" },
  DEBUG: { text: "text-muted-foreground", bg: "bg-tertiary" },
  WARNING: { text: "text-dark-yellow", bg: "bg-light-yellow" },
  ERROR: { text: "text-dark-red", bg: "bg-light-red" },
};

export type LevelColor = { text: string; bg: string };

const NEUTRAL_LEVEL_COLOR: LevelColor = { text: "", bg: "" };

/**
 * Total color lookup for a level value. A level is user-/OTel-controlled data
 * (an open string — e.g. an OTel severity like "INFO", lowercase "info", or a
 * custom SDK level — not a closed enum), so `LevelColors[level]` may be
 * `undefined`. Dereferencing `.bg`/`.text` on that undefined crashed the
 * trace/observations tables (LFE-14567). Every color lookup must therefore be
 * total: unknown or absent levels get a neutral (no color chip) fallback.
 */
export function getLevelColors(level: string | null | undefined): LevelColor {
  // Own-property check (NOT `in`): `in` walks the prototype chain, so a level
  // literally named "toString"/"constructor"/"valueOf" would otherwise match
  // and return an inherited `Object.prototype` function instead of a
  // `{ text, bg }` — breaking the "total" contract for that sliver of inputs.
  return level != null && Object.hasOwn(LevelColors, level)
    ? LevelColors[level as keyof typeof LevelColors]
    : NEUTRAL_LEVEL_COLOR;
}

// Colored bar per level value for the Status filter facet (LFE-10883):
// red = error, yellow = warning, green = the ok/default path, muted = debug.
const levelBarColors: Record<string, string> = {
  DEFAULT: "bg-accent-dark-green",
  DEBUG: "bg-muted-foreground/40",
  WARNING: "bg-dark-yellow",
  ERROR: "bg-dark-red",
};

/** Renders the colored status bar for a level facet option (renderIcon). */
export function renderLevelIcon(value: string): React.ReactNode {
  const color = levelBarColors[value.toUpperCase()];
  if (!color) return null;
  return (
    <span
      aria-hidden
      className={cn("inline-block h-3.5 w-1 shrink-0 rounded-full", color)}
    />
  );
}

export const LevelSymbols = {
  DEFAULT: "ℹ️",
  DEBUG: "🔍",
  WARNING: "⚠️",
  ERROR: "🚨",
};

export const formatAsLabel = (countLabel: string) => {
  return countLabel.replace(/Count$/, "").toUpperCase() as ObservationLevelType;
};
