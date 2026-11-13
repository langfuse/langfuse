import { type ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/src/components/ui/sheet";
import { APP_SIDEBAR_ID } from "@/src/features/app-shell/constants/sidebarDom";
import {
  useAppShellSidebar,
  useAppShellSidebarActions,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";
import { SidebarSurfaceProvider } from "@/src/features/app-shell/contexts/SidebarSurfaceProvider";
import { cn } from "@/src/utils/tailwind";

function MobileSidebar({ children }: { children: ReactNode }) {
  const isMobileOpen = useAppShellSidebar((state) => state.isMobileOpen);
  const { setMobileOpen } = useAppShellSidebarActions();
  return (
    <Sheet open={isMobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent
        id={APP_SIDEBAR_ID}
        side="left"
        className="bg-sidebar text-sidebar-foreground flex w-full max-w-none flex-col gap-0 border-0 p-0 sm:max-w-none"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">
          Switch workspace and navigate Langfuse.
        </SheetDescription>
        <SidebarSurfaceProvider surface="sheet">
          {children}
        </SidebarSurfaceProvider>
      </SheetContent>
    </Sheet>
  );
}

/** Desktop navigation always occupies its own column; mobile navigation fills the viewport. */
export function ShellSidebar({
  isMobile,
  children,
}: {
  isMobile: boolean;
  children: ReactNode;
}) {
  const isExpanded = useAppShellSidebar((state) => state.isExpanded);
  if (isMobile) return <MobileSidebar>{children}</MobileSidebar>;
  return (
    <SidebarSurfaceProvider surface={isExpanded ? "docked" : "rail"}>
      <aside
        id={APP_SIDEBAR_ID}
        aria-label="Sidebar"
        data-sidebar-layout={isExpanded ? "expanded" : "rail"}
        className={cn(
          "bg-sidebar text-sidebar-foreground border-sidebar-border h-screen-with-banner flex shrink-0 flex-col border-r",
          isExpanded ? "w-56" : "w-14",
        )}
      >
        {children}
      </aside>
    </SidebarSurfaceProvider>
  );
}
