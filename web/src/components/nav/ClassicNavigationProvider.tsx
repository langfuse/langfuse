import { useMemo, type ReactNode } from "react";
import { AppNavigationProvider } from "@/src/components/nav/AppNavigationProvider";
import { SidebarTrigger, useSidebar } from "@/src/components/ui/sidebar";

/** Implements the app navigation interface for the classic collapsible sidebar. */
export function ClassicNavigationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const value = useMemo(
    () => ({
      shell: "classic" as const,
      isSidebarExpanded: state === "expanded",
      SidebarControl: SidebarTrigger,
      openMobileNavigation: () => setOpenMobile(true),
      closeTransientNavigation: () => {
        if (isMobile) setOpenMobile(false);
      },
    }),
    [state, isMobile, setOpenMobile],
  );

  return (
    <AppNavigationProvider value={value}>{children}</AppNavigationProvider>
  );
}
