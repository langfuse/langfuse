import React from "react";

import { cn } from "@/src/utils/tailwind";
import { type GraphViewMode } from "../types";

/**
 * Segmented mode switch overlaid on the graph canvas. Mirrors the
 * Tree/Timeline/Graph ViewModeSwitch styling (TracePanelNavigationHeader) —
 * text-only labels — so the trace view's mode switches read as one family.
 */
const MODES: {
  mode: GraphViewMode;
  label: string;
  title: string;
}[] = [
  {
    mode: "aggregated",
    label: "Aggregated",
    title: "Repeated steps grouped into one node — the overall shape",
  },
  {
    mode: "expanded",
    label: "Expanded",
    title: "Every call as its own node, in the order it ran",
  },
];

export function GraphViewModeSwitch({
  value,
  onChange,
}: {
  value: GraphViewMode;
  onChange: (mode: GraphViewMode) => void;
}) {
  return (
    <div className="bg-background/80 inline-flex h-7 items-center rounded-md border p-0.5 backdrop-blur">
      {MODES.map(({ mode, label, title }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-pressed={value === mode}
          aria-label={label}
          title={title}
          className={cn(
            "flex h-6 items-center rounded-md px-2 text-xs font-bold transition-colors",
            value === mode
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
