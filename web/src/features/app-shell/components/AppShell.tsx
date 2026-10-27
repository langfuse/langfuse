import { useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import {
  AppNavigationProvider,
  type AppNavigation,
} from "@/src/components/nav/AppNavigationProvider";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { ShellSidebar } from "@/src/features/app-shell/components/ShellSidebar";
import { SidebarHandle } from "@/src/features/app-shell/components/SidebarHandle";
import {
  AppShellSidebarProvider,
  useAppShellSidebar,
  useAppShellSidebarActions,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";
import { useRecordRecentProject } from "@/src/features/app-shell/hooks/useRecordRecentProject";
import { useSidebarEdgeHover } from "@/src/features/app-shell/hooks/useSidebarEdgeHover";
import { useSidebarShortcuts } from "@/src/features/app-shell/hooks/useSidebarShortcuts";

function AppShellFrame({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const isPinned = useAppShellSidebar((state) => state.isPinned);
  const { setMobileOpen, close } = useAppShellSidebarActions();
  const session = useSession();
  const [navigation] = useState<AppNavigation>(() => ({
    shell: "next",
    SidebarControl: SidebarHandle,
    openMobileNavigation: () => setMobileOpen(true),
    closeTransientNavigation: () => {
      close();
      setMobileOpen(false);
    },
  }));

  useSidebarShortcuts(isMobile ? "mobile" : "desktop");
  useSidebarEdgeHover(!isMobile && !isPinned);
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
 * The app shell with one sidebar. Pinned, the sidebar is docked and pushes
 * the content. Unpinned, it is hidden and opens as an overlay from the left
 * edge, the header handle, or Mod+B. On small screens it is a drawer.
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
