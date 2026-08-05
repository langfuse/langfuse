"use client";

import { type ReactNode, type RefObject } from "react";

import {
  MovableResizablePanel,
  type MovableResizablePanelHandle,
} from "@/src/components/movable-resizable-panel";

const IN_APP_AGENT_WINDOW_SHELL_DRAG_HANDLE_SELECTOR =
  "[data-in-app-agent-window-drag-handle='true']";

type InAppAgentWindowShellProps = {
  children: (props: { isHeaderDragHandleEnabled: boolean }) => ReactNode;
  floatingPanelHandle: MovableResizablePanelHandle;
  isExpanded: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
};

export function InAppAgentWindowShell({
  children,
  floatingPanelHandle,
  isExpanded,
  panelRef,
}: InAppAgentWindowShellProps) {
  if (!isExpanded && !floatingPanelHandle.geometry) {
    return null;
  }

  // The shell renders inside the `agent` overlay layer (see
  // components/ui/layer.tsx), whose container is `pointer-events: none` so the
  // rest of the app stays click-through. The panel is the interactive surface,
  // so it opts pointer events back in via `pointer-events-auto`. No z-index:
  // layer ORDER stacks the whole `agent` layer below every transient overlay.
  if (isExpanded) {
    return (
      <div
        ref={panelRef}
        className="pointer-events-auto fixed inset-x-3 top-[calc(var(--banner-offset)+0.75rem)] bottom-3 origin-top-left"
        data-ignore-outside-interaction
      >
        <div
          data-ignore-outside-interaction
          className="h-full w-full origin-top-left"
        >
          {children({ isHeaderDragHandleEnabled: false })}
        </div>
      </div>
    );
  }

  return (
    <MovableResizablePanel
      dragHandleSelector={IN_APP_AGENT_WINDOW_SHELL_DRAG_HANDLE_SELECTOR}
      ignoreOutsideInteraction
      ref={panelRef}
      handle={floatingPanelHandle}
      className="pointer-events-auto"
    >
      <div
        data-ignore-outside-interaction
        className="h-full w-full origin-top-left"
      >
        {children({ isHeaderDragHandleEnabled: true })}
      </div>
    </MovableResizablePanel>
  );
}
