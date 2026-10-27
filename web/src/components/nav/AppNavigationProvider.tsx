import {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
} from "react";

/**
 * What page chrome needs from whichever app shell is mounted.
 *
 * Only `AuthenticatedLayout` mounts a shell with a sidebar. The sidebar-less
 * `MinimalLayout` / `UnauthenticatedLayout` (public share views, auth pages)
 * provide nothing, so `useAppNavigation()` is `null` there and chrome that only
 * mirrors a sidebar (the header sidebar control, the mobile hamburger, the
 * mobile brand mark) does not render.
 *
 * Both shells implement the same interface, so feature components that open
 * a drawer from the sidebar (Support, migration panel) work in either.
 */
export type AppNavigation = {
  shell: "classic" | "next";
  /** Desktop header control that reveals or toggles the sidebar. */
  SidebarControl: ComponentType;
  openMobileNavigation: () => void;
  /** Hides the sidebar wherever it is shown only temporarily: the overlay or the mobile sheet. */
  closeTransientNavigation: () => void;
};

const AppNavigationContext = createContext<AppNavigation | null>(null);

export function AppNavigationProvider({
  value,
  children,
}: {
  value: AppNavigation;
  children: ReactNode;
}) {
  return (
    <AppNavigationContext.Provider value={value}>
      {children}
    </AppNavigationContext.Provider>
  );
}

export function useAppNavigation(): AppNavigation | null {
  return useContext(AppNavigationContext);
}

export function useHasAppSidebar(): boolean {
  return useContext(AppNavigationContext) !== null;
}
