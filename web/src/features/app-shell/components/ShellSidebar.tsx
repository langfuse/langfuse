import { useEffect, useState, type ReactNode } from "react";
import {
  FloatingFocusManager,
  FloatingOverlay,
  useDismiss,
  useFloating,
} from "@floating-ui/react";
import { Layer } from "@/src/components/design-system/Layer/Layer";
import { LayerContainerProvider } from "@/src/context/LayerContext/LayerContext";
import { PopoverLayerProvider } from "@/src/context/LayerContext/PopoverLayerProvider";
import { APP_SIDEBAR_ID } from "@/src/features/app-shell/constants/sidebarDom";
import {
  useAppShellSidebar,
  useAppShellSidebarActions,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";
import {
  SidebarSurfaceProvider,
  type SidebarSurface,
} from "@/src/features/app-shell/contexts/SidebarSurfaceProvider";
import { cn } from "@/src/utils/tailwind";
import motion from "./sidebarMotion.module.css";

/** One persistent navigation surface changes its layout and mobile modality. */
export function ShellSidebar({
  isMobile,
  children,
}: {
  isMobile: boolean;
  children: ReactNode;
}) {
  const isExpanded = useAppShellSidebar((state) => state.isExpanded);
  const isMobileOpen = useAppShellSidebar((state) => state.isMobileOpen);
  const { setMobileOpen } = useAppShellSidebarActions();
  const desktopMode: SidebarSurface = isExpanded ? "expanded" : "collapsed";
  const mode: SidebarSurface = isMobile ? "mobile" : desktopMode;
  const isModal = mode === "mobile" && isMobileOpen;
  const isHidden = mode === "mobile" && !isMobileOpen;
  const [modalContainer, setModalContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const [popoverContainer, setPopoverContainer] =
    useState<HTMLDivElement | null>(null);
  const { refs, elements, context } = useFloating({
    open: isModal,
    onOpenChange: setMobileOpen,
  });

  useDismiss(context, { enabled: isModal, outsidePress: false });

  // Nested Radix surfaces own Escape in capture; keep their event from also
  // reaching the mobile menu's document-level dismissal listener.
  useEffect(() => {
    const panel = elements.floating;
    if (!isModal || !panel) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const path = event.composedPath();
      if (
        (modalContainer && path.includes(modalContainer)) ||
        (popoverContainer && path.includes(popoverContainer))
      ) {
        event.stopPropagation();
      }
    };
    panel.addEventListener("keydown", handleKeyDown);
    return () => panel.removeEventListener("keydown", handleKeyDown);
  }, [elements.floating, isModal, modalContainer, popoverContainer]);

  return (
    <SidebarSurfaceProvider surface={mode}>
      <div
        aria-hidden="true"
        data-sidebar-mode={mode}
        className={motion.gutter}
      />
      <Layer name="panel">
        {isModal && <FloatingOverlay lockScroll aria-hidden="true" />}
        <FloatingFocusManager
          context={context}
          disabled={!isModal}
          modal
          outsideElementsInert
          returnFocus
          initialFocus={0}
        >
          <aside
            ref={refs.setFloating}
            id={APP_SIDEBAR_ID}
            role={mode === "mobile" ? "dialog" : "complementary"}
            aria-label={mode === "mobile" ? "Navigation" : "Sidebar"}
            aria-modal={isModal || undefined}
            aria-hidden={isHidden || undefined}
            inert={isHidden}
            tabIndex={-1}
            data-sidebar-mode={mode}
            data-mobile-open={isMobileOpen}
            className={cn(
              "bg-sidebar text-sidebar-foreground border-sidebar-border top-banner-offset fixed bottom-0 left-0 flex flex-col border-r",
              motion.surface,
            )}
          >
            <LayerContainerProvider name="modal" container={modalContainer}>
              <PopoverLayerProvider container={popoverContainer}>
                {children}
              </PopoverLayerProvider>
            </LayerContainerProvider>
            <div
              className="absolute isolate"
              data-layer="modal"
              ref={setModalContainer}
            />
            <div
              className="absolute isolate"
              data-layer="popover"
              ref={setPopoverContainer}
            />
          </aside>
        </FloatingFocusManager>
      </Layer>
    </SidebarSurfaceProvider>
  );
}
