import React from "react";
import { Combine, Route, type LucideIcon } from "lucide-react";

import { ToggleGroup } from "@/src/components/design-system/ToggleGroup/ToggleGroup";
import { type GraphViewMode } from "../types";

/**
 * Segmented mode switch overlaid on the graph canvas.
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
    <div className="bg-background/80 rounded-md backdrop-blur">
      <ToggleGroup
        value={value}
        onValueChange={(mode) => onChange(mode as GraphViewMode)}
      >
        <ToggleGroup.List size="md" aria-label="Graph mode">
          {MODES.map(({ mode, icon: Icon, label, title }) => (
            <ToggleGroup.Trigger key={mode} value={mode} title={title}>
              <Icon aria-hidden="true" className="icon-base shrink-0" />
              {/* Icons only on narrow canvases so the switch never collides
                  with the zoom stack. */}
              <span className="@max-[340px]/graphcanvas:sr-only">{label}</span>
            </ToggleGroup.Trigger>
          ))}
        </ToggleGroup.List>
      </ToggleGroup>
    </div>
  );
}
