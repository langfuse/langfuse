import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Layer } from "@/src/components/design-system/Layer/Layer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/src/components/ui/sheet";
import { PopoverLayerProvider } from "@/src/context/LayerContext/PopoverLayerProvider";
import { APP_SIDEBAR_ID } from "@/src/features/app-shell/constants/sidebarDom";
import {
  useAppShellSidebar,
  useAppShellSidebarActions,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";
import { SidebarSurfaceProvider } from "@/src/features/app-shell/contexts/SidebarSurfaceProvider";
import { useOverlayDismiss } from "@/src/features/app-shell/hooks/useOverlayDismiss";
import { useOverlayFocus } from "@/src/features/app-shell/hooks/useOverlayFocus";
import { type SidebarPeek } from "@/src/features/app-shell/stores/sidebarStore";

const isHoverPointer = (event: PointerEvent) => event.pointerType !== "touch";

/** Pinned: part of the layout, pushing the content like a classic sidebar. */
function DockedSidebar({ children }: { children: ReactNode }) {
  return (
    <SidebarSurfaceProvider surface="docked">
      <aside
        id={APP_SIDEBAR_ID}
        aria-label="Sidebar"
        className="bg-sidebar text-sidebar-foreground border-sidebar-border h-screen-with-banner flex w-56 shrink-0 flex-col border-r"
      >
        {children}
      </aside>
    </SidebarSurfaceProvider>
  );
}

/** Unpinned: floats above the page in the panel layer, so opening it never shifts the layout. */
function OverlaySidebar({
  peek,
  children,
}: {
  peek: Exclude<SidebarPeek, "closed">;
  children: ReactNode;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [popoverContainer, setPopoverContainer] =
    useState<HTMLDivElement | null>(null);
  const { pointerEnterPanel, pointerLeavePanel, dismiss } =
    useAppShellSidebarActions();
  useOverlayDismiss(overlayRef, dismiss);
  useOverlayFocus(overlayRef, peek === "keyboard");

  return (
    <Layer name="panel">
      <SidebarSurfaceProvider surface="overlay">
        {/* The wrapper holds the panel and the menus it opens, so moving the
            pointer or focus from the panel into one of its menus still counts
            as being inside. It stays untransformed: the panel's entrance
            animation must not become the containing block of those menus. */}
        <div
          ref={overlayRef}
          onPointerEnter={(event) => {
            if (isHoverPointer(event)) pointerEnterPanel();
          }}
          onPointerLeave={(event) => {
            if (isHoverPointer(event)) pointerLeavePanel();
          }}
          onBlur={(event) => {
            // Tabbing past the last entry hands focus back to the page.
            const next = event.relatedTarget;
            if (next instanceof Node && !event.currentTarget.contains(next)) {
              dismiss();
            }
          }}
        >
          <aside
            id={APP_SIDEBAR_ID}
            aria-label="Sidebar"
            data-peek={peek}
            className="bg-sidebar text-sidebar-foreground border-sidebar-border data-[peek=hover]:animate-in data-[peek=hover]:fade-in-0 data-[peek=hover]:slide-in-from-left-2 fixed top-[calc(var(--banner-offset)+0.5rem)] bottom-2 left-2 flex w-56 flex-col rounded-lg border shadow-xl duration-150 motion-reduce:animate-none"
          >
            <PopoverLayerProvider container={popoverContainer}>
              {children}
            </PopoverLayerProvider>
          </aside>
          <div
            className="absolute isolate"
            data-layer="popover"
            ref={setPopoverContainer}
          />
        </div>
      </SidebarSurfaceProvider>
    </Layer>
  );
}

/** Small screens: the same panel as a drawer, opened from the top bar. */
function SheetSidebar({ children }: { children: ReactNode }) {
  const isMobileOpen = useAppShellSidebar((state) => state.isMobileOpen);
  const { setMobileOpen } = useAppShellSidebarActions();

  return (
    <Sheet open={isMobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent
        id={APP_SIDEBAR_ID}
        side="left"
        className="bg-sidebar text-sidebar-foreground flex w-72 max-w-[85vw] flex-col gap-0 p-0 [&>button]:hidden"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">
          Switch project and navigate Langfuse.
        </SheetDescription>
        <SidebarSurfaceProvider surface="sheet">
          {children}
        </SidebarSurfaceProvider>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Renders the one sidebar panel on the surface that fits: docked when pinned,
 * a floating overlay while peeked, a drawer on small screens. Closed and
 * unpinned, it is not rendered at all.
 */
export function ShellSidebar({
  isMobile,
  children,
}: {
  isMobile: boolean;
  children: ReactNode;
}) {
  const isPinned = useAppShellSidebar((state) => state.isPinned);
  const peek = useAppShellSidebar((state) => state.peek);

  if (isMobile) return <SheetSidebar>{children}</SheetSidebar>;
  if (isPinned) return <DockedSidebar>{children}</DockedSidebar>;
  return peek === "closed" ? (
    <span id={APP_SIDEBAR_ID} hidden />
  ) : (
    <OverlaySidebar peek={peek}>{children}</OverlaySidebar>
  );
}
