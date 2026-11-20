"use client";

import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { Button } from "@/src/components/ui/button";
import {
  IN_APP_AGENT_LAYOUT_MODES,
  IN_APP_AGENT_LAYOUT_MODE_OPTIONS,
  type InAppAgentLayoutMode,
} from "@/src/features/in-app-agent/layoutMode";

export function InAppAgentLayoutSwitcher({
  value,
  onChange,
}: {
  value: InAppAgentLayoutMode;
  onChange: (layoutMode: InAppAgentLayoutMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Halo layout"
      className="mr-1 flex shrink-0 items-center gap-0.5 rounded-md border p-0.5"
    >
      {IN_APP_AGENT_LAYOUT_MODES.map((layoutMode) => {
        const option = IN_APP_AGENT_LAYOUT_MODE_OPTIONS[layoutMode];

        return (
          <Tooltip
            key={layoutMode}
            label={option.label}
            delay={100}
            hoverableContent={false}
          >
            {({ getTriggerProps }) => (
              <Button
                {...getTriggerProps()}
                type="button"
                variant="ghost"
                size="icon"
                className="aria-pressed:bg-accent size-5 shrink-0 rounded-sm"
                aria-label={option.label}
                aria-pressed={layoutMode === value}
                onClick={() => {
                  onChange(layoutMode);
                }}
              >
                <option.icon
                  size="sm"
                  color={layoutMode === value ? "default" : "muted"}
                />
              </Button>
            )}
          </Tooltip>
        );
      })}
    </div>
  );
}
