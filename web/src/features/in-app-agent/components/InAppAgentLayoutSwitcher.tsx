"use client";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
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
              <IconButton
                {...getTriggerProps()}
                icon={option.icon}
                label={option.label}
                size="sm"
                variant="toolbar"
                aria-pressed={layoutMode === value}
                onClick={() => {
                  onChange(layoutMode);
                }}
              />
            )}
          </Tooltip>
        );
      })}
    </div>
  );
}
