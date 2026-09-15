/* eslint-disable @repo/no-null-render */
"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

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

/**
 * Holds a top/bottom-anchored fixed element on the *visible* viewport while the
 * on-screen keyboard is up.
 *
 * A phone's keyboard shrinks the visual viewport but not the layout viewport
 * that `position: fixed` measures from, so `bottom: 0` lands behind the
 * keyboard. Recomputed from what the viewport reports on every event and never
 * accumulated: no number of open/close cycles can leave it out of phase, and
 * anything unexpected clamps back to the plain CSS anchoring. Written straight
 * onto the element because a keyboard transition streams events and the
 * assistant is an expensive tree to re-render.
 */
function useVisibleViewportAnchoring(
  element: HTMLElement | null,
  isEnabled: boolean,
) {
  useEffect(() => {
    // External system: the visual viewport. `resize` fires when the keyboard
    // opens or closes, `scroll` when Safari slides the visible band instead to
    // reveal a focused field. Absent on older browsers — CSS then owns it.
    const viewport = window.visualViewport;
    if (!isEnabled || !element || !viewport) {
      return;
    }

    const anchor = () => {
      const bandTop = Math.max(0, Math.round(viewport.offsetTop));
      const hiddenBelowBand = Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - bandTop),
      );

      element.style.bottom = `${hiddenBelowBand}px`;
      // `max()` so the banner keeps the top edge whenever it is the lower of
      // the two; written at all only while the band is scrolled.
      element.style.top =
        bandTop > 0 ? `max(var(--banner-offset), ${bandTop}px)` : "";
    };

    anchor();
    viewport.addEventListener("resize", anchor);
    viewport.addEventListener("scroll", anchor);

    return () => {
      viewport.removeEventListener("resize", anchor);
      viewport.removeEventListener("scroll", anchor);
      element.style.bottom = "";
      element.style.top = "";
    };
  }, [element, isEnabled]);
}

type InAppAgentWindowShellProps = {
  children: (props: { isHeaderDragHandleEnabled: boolean }) => ReactNode;
  floatingPanelHandle: MovableResizablePanelHandle;
  isExpanded: boolean;
  onClose: () => void;
  onExpandedChange: (isExpanded: boolean) => void;
  open: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
};

export function InAppAgentWindowShell({
  children,
  floatingPanelHandle,
  isExpanded,
  onClose,
  onExpandedChange,
  open,
  panelRef,
}: InAppAgentWindowShellProps) {
  const isHandheld = useIsHandheld();
  // State, not a ref: the drawer portals into its layer container, which itself
  // resolves in an effect, so the node arrives a commit late and has to be the
  // dependency that arms the anchoring.
  const [drawerElement, setDrawerElement] = useState<HTMLDivElement | null>(
    null,
  );

  useVisibleViewportAnchoring(drawerElement, isHandheld && open);

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
        // Vaul's own keyboard dodge is off: it TOGGLES a "keyboard is open" flag
        // on every large visual-viewport step instead of reading the direction,
        // so one extra step — iOS reports a closing keyboard in two — inverts it
        // and the next dismissal is skipped, stranding the drawer at keyboard
        // height. It also writes an inline `height`, over-constraining this box.
        repositionInputs={false}
      >
        <DrawerContent
          ref={setDrawerElement}
          id="in-app-agent-drawer"
          size="full"
          // `h-auto` at every breakpoint so top/bottom anchoring owns the
          // geometry. Bottom drawers default to content height; a leftover
          // `md:h-full` used to survive tailwind-merge on a landscape phone
          // (handheld and wider than `md`), so `top` + `bottom` + `height`
          // over-constrained the box, dropping `bottom` and pushing the
          // composer off-screen by the banner offset.
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
      // The header's own `onDoubleClick` covers every other presentation; only
      // here is the handle also a drag surface that eats the event.
      onDragHandleDoubleClick={() => {
        onExpandedChange(true);
      }}
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
