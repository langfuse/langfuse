"use client";

import { useCallback, type ReactNode, type RefObject } from "react";

import {
  MovableResizablePanel,
  type MovableResizablePanelHandle,
  type MovableResizablePanelSize,
  useMovableResizablePanelControl,
} from "@/src/components/movable-resizable-panel";
import { Drawer, DrawerContent, DrawerTitle } from "@/src/components/ui/drawer";
import { useIsHandheld } from "@/src/hooks/use-mobile";

const IN_APP_AGENT_WINDOW_SHELL_BOUNDS_PADDING_PX = 8;
const IN_APP_AGENT_WINDOW_SHELL_DEFAULT_WIDTH_PX = 448;
const IN_APP_AGENT_WINDOW_SHELL_DEFAULT_MAX_HEIGHT_PX = 672;
const IN_APP_AGENT_WINDOW_SHELL_DRAG_HANDLE_SELECTOR =
  "[data-in-app-agent-window-drag-handle='true']";
const IN_APP_AGENT_WINDOW_SHELL_MIN_SIZE = {
  width: 360,
  height: 420,
} satisfies MovableResizablePanelSize;

export function useInAppAgentWindowShellPanelControl({
  anchorRef,
}: {
  anchorRef?: RefObject<HTMLElement | null>;
} = {}) {
  const getInitialGeometry = useCallback(() => {
    const anchorRect = anchorRef?.current?.getBoundingClientRect();
    const viewportHeight =
      typeof window === "undefined" ? 768 : window.innerHeight;
    const viewportWidth =
      typeof window === "undefined" ? 1024 : window.innerWidth;
    const width = Math.min(
      IN_APP_AGENT_WINDOW_SHELL_DEFAULT_WIDTH_PX,
      viewportWidth - IN_APP_AGENT_WINDOW_SHELL_BOUNDS_PADDING_PX * 2,
    );
    const height = Math.min(
      IN_APP_AGENT_WINDOW_SHELL_DEFAULT_MAX_HEIGHT_PX,
      viewportHeight - 32,
    );

    return {
      position: {
        left: anchorRect
          ? anchorRect.right - 6
          : viewportWidth - width - IN_APP_AGENT_WINDOW_SHELL_BOUNDS_PADDING_PX,
        top:
          viewportHeight - height - IN_APP_AGENT_WINDOW_SHELL_BOUNDS_PADDING_PX,
      },
      size: { width, height },
    };
  }, [anchorRef]);

  return useMovableResizablePanelControl({
    boundsPadding: IN_APP_AGENT_WINDOW_SHELL_BOUNDS_PADDING_PX,
    getInitialGeometry,
    minSize: IN_APP_AGENT_WINDOW_SHELL_MIN_SIZE,
  });
}

type InAppAgentWindowShellProps = {
  children: (props: { isHeaderDragHandleEnabled: boolean }) => ReactNode;
  floatingPanelHandle: MovableResizablePanelHandle;
  isExpanded: boolean;
  onClose: () => void;
  open: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
};

export function InAppAgentWindowShell({
  children,
  floatingPanelHandle,
  isExpanded,
  onClose,
  open,
  panelRef,
}: InAppAgentWindowShellProps) {
  const isHandheld = useIsHandheld();

  // A phone has one presentation: the whole screen below the banner. A real
  // (Vaul) modal drawer — the same treatment as the support / migration
  // drawers — so the page behind is scroll-locked and there is exactly one
  // scroller, and never the movable panel (drag/resize is meaningless on
  // touch). Stays mounted while closed so Vaul can animate itself out.
  //
  // `dismissible={false}`: this is a page, not a sheet, so it never follows a
  // drag and you cannot pull it down to close — the header's close button is
  // the way out. That also makes Vaul swallow every close routed through
  // `onOpenChange`, so Escape is re-armed explicitly below (it still matters in
  // a narrow desktop window, which is handheld too).
  if (isHandheld) {
    return (
      <Drawer
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            onClose();
          }
        }}
        dismissible={false}
        forceDirection="bottom"
      >
        <DrawerContent
          id="in-app-agent-drawer"
          size="full"
          // `h-auto` at every breakpoint so top/bottom anchoring owns the
          // geometry: the drawer's default height variant is `h-1/3 md:h-full`,
          // and the `md:` half survives tailwind-merge — a landscape phone is
          // both handheld and wider than `md`, and `top` + `bottom` + `height`
          // over-constrains the box, dropping `bottom` and pushing the composer
          // off-screen by the banner offset. Vaul still overrides the height to
          // dodge the on-screen keyboard.
          className="top-banner-offset inset-x-0 bottom-0 h-auto rounded-none border-0 md:h-auto"
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            onClose();
          }}
        >
          <DrawerTitle className="sr-only">Assistant</DrawerTitle>
          {children({ isHeaderDragHandleEnabled: false })}
        </DrawerContent>
      </Drawer>
    );
  }

  if (!open || (!isExpanded && !floatingPanelHandle.geometry)) {
    return null;
  }

  // The shell renders inside the `agent` overlay layer (see
  // components/ui/layer.tsx), whose container is `pointer-events: none` so the
  // rest of the app stays click-through. The panel is the interactive surface,
  // so it opts pointer events back in via `pointer-events-auto`. No z-index:
  // layer ORDER stacks the whole `agent` layer below every transient overlay.
  if (isExpanded) {
    return (
      // `--banner-offset` carries the top inset; the other three edges add
      // theirs here, because the viewport meta's `viewport-fit=cover` extends
      // layout under the home indicator and, in landscape, the notch.
      <div
        ref={panelRef}
        className="pointer-events-auto fixed top-[calc(var(--banner-offset)+0.75rem)] right-[calc(0.75rem+env(safe-area-inset-right,0px))] bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] left-[calc(0.75rem+env(safe-area-inset-left,0px))] origin-top-left"
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
