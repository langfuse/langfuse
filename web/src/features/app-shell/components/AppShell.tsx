import { useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
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
import { useRecordRecentProject } from "@/src/features/app-shell/hooks/useRecordRecentProject";
import { useSidebarShortcuts } from "@/src/features/app-shell/hooks/useSidebarShortcuts";

function AppShellFrame({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const isMobile = useAppShellSidebar((state) => state.isMobile);
  const { setMobileOpen, close } = useAppShellSidebarActions();
  const session = useSession();
  const [navigation] = useState<AppNavigation>(() => ({
    shell: "next",
    SidebarControl: SidebarExpansionToggle,
    openMobileNavigation: () => setMobileOpen(true),
    closeTransientNavigation: close,
  }));

  useSidebarShortcuts(isMobile ? "mobile" : "desktop");
  useRecordRecentProject(session.data?.user?.id ?? "anonymous");

  return (
    <AppNavigationProvider value={navigation}>
      <ShellSidebar isMobile={isMobile}>{sidebar}</ShellSidebar>
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
