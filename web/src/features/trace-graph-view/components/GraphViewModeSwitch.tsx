import React from "react";
import { Combine, Route, type LucideIcon } from "lucide-react";

import { cn } from "@/src/utils/tailwind";
import { type GraphViewMode } from "../types";

/**
 * Segmented mode switch overlaid on the graph canvas. Mirrors the Tree/Timeline
 * ViewModeSwitch styling (TracePanelNavigationHeader) so the trace view's mode
 * switches read as one family.
 */
const MODES: {
  mode: GraphViewMode;
  icon: LucideIcon;
  label: string;
  title: string;
}[] = [
  {
    mode: "aggregated",
    icon: Combine,
    label: "Aggregated",
    title: "Repeated steps grouped into one node — the overall shape",
  },
  {
    mode: "expanded",
    icon: Route,
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
      {MODES.map(({ mode, icon: Icon, label, title }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-pressed={value === mode}
          aria-label={label}
          title={title}
          className={cn(
            "flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-bold transition-colors",
            value === mode
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {/* Collapse to icons on narrow canvases (mirrors the nav header's
              switch) so the pill never collides with the zoom stack. */}
          <span className="@max-[340px]/graphcanvas:hidden">{label}</span>
        </button>
      ))}
    </div>
  );
}
