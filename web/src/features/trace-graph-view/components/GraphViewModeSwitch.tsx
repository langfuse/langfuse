import React from "react";
import { Combine, Route, type LucideIcon } from "lucide-react";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
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
      <Tabs
        value={value}
        onValueChange={(mode) => onChange(mode as GraphViewMode)}
      >
        <Tabs.List size="md" aria-label="Graph mode">
          {MODES.map(({ mode, icon: Icon, label, title }) => (
            <Tabs.Trigger key={mode} value={mode} title={title}>
              <Icon aria-hidden="true" className="size-3.5 shrink-0" />
              {/* Icons only on narrow canvases so the switch never collides
                  with the zoom stack. */}
              <span className="@max-[340px]/graphcanvas:hidden">{label}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs>
    </div>
  );
}
