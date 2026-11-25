import { useMemo, useRef, type ReactNode } from "react";
import {
  AppNavigationProvider,
  type AppNavigation,
} from "@/src/components/nav/AppNavigationProvider";
import { ShellSidebar } from "@/src/features/app-shell/components/ShellSidebar";
import { SidebarExpansionToggle } from "@/src/features/app-shell/components/SidebarExpansionToggle";
import {
  AppShellSidebarProvider,
  useAppShellSidebar,
  useAppShellSidebarActions,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";
import { useSidebarShortcuts } from "@/src/features/app-shell/hooks/useSidebarShortcuts";

function AppShellFrame({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const isMobile = useAppShellSidebar((state) => state.isMobile);
  const isExpanded = useAppShellSidebar((state) => state.isExpanded);
  const { setMobileOpen, close } = useAppShellSidebarActions();
  const mobileNavigationTriggerRef = useRef<HTMLButtonElement>(null);
  const navigation = useMemo<AppNavigation>(
    () => ({
      shell: "next",
      isSidebarExpanded: isExpanded,
      SidebarControl: SidebarExpansionToggle,
      openMobileNavigation: () => setMobileOpen(true),
      mobileNavigationTriggerRef,
      closeTransientNavigation: close,
    }),
    [isExpanded, setMobileOpen, close],
  );

  useSidebarShortcuts(isMobile ? "mobile" : "desktop");

  return (
    <AppNavigationProvider value={navigation}>
      <ShellSidebar
        isMobile={isMobile}
        mobileNavigationTriggerRef={mobileNavigationTriggerRef}
      >
        {sidebar}
      </ShellSidebar>
      {/* `min-w-0`, not a `100vw`-derived width: viewport units ignore
          scrollbars, so a definite width would overflow beside the sidebar
          once a space-taking vertical scrollbar shows. */}
      <main className="bg-background h-screen-with-banner relative flex max-w-full min-w-0 flex-1 flex-col">
        {children}
      </main>
    </AppNavigationProvider>
  );
}

/**
 * Desktop navigation stays docked as either full navigation or an icon rail.
 * Small screens open the same navigation through a full-width menu.
 */
export function AppShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppShellSidebarProvider>
      <AppShellFrame sidebar={sidebar}>{children}</AppShellFrame>
    </AppShellSidebarProvider>
  );
}
