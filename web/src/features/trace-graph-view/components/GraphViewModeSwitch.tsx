import React from "react";
import { Combine, Route, type LucideIcon } from "lucide-react";

import { cn } from "@/src/utils/tailwind";
import { type GraphViewMode } from "../types";
import { useTranslations } from "next-intl";

/**
 * Segmented mode switch overlaid on the graph canvas. Mirrors the Tree/Timeline
 * ViewModeSwitch styling (TracePanelNavigationHeader) so the trace view's mode
 * switches read as one family.
 */
const MODES: {
  mode: GraphViewMode;
  icon: LucideIcon;
  labelKey: "aggregated" | "expanded";
  titleKey: "aggregatedDescription" | "expandedDescription";
}[] = [
  {
    mode: "aggregated",
    icon: Combine,
    labelKey: "aggregated",
    titleKey: "aggregatedDescription",
  },
  {
    mode: "expanded",
    icon: Route,
    labelKey: "expanded",
    titleKey: "expandedDescription",
  },
];

export function GraphViewModeSwitch({
  value,
  onChange,
}: {
  value: GraphViewMode;
  onChange: (mode: GraphViewMode) => void;
}) {
  const t = useTranslations("systemUi.miscUi.graphModes");
  return (
    <div className="bg-background/80 inline-flex h-7 items-center rounded-md border p-0.5 backdrop-blur">
      {MODES.map(({ mode, icon: Icon, labelKey, titleKey }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-pressed={value === mode}
          aria-label={t(labelKey)}
          title={t(titleKey)}
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
          <span className="@max-[340px]/graphcanvas:hidden">{t(labelKey)}</span>
        </button>
      ))}
    </div>
  );
}
