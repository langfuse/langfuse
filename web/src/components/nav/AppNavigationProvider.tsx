import {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
  type RefObject,
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
 * The app shell implements this interface, so feature components that open
 * a drawer from the sidebar (Support, migration panel) share one contract.
 */
export type AppNavigation = {
  shell: "next";
  /** Desktop expansion determines whether page chrome repeats the organization selector. */
  readonly isSidebarExpanded: boolean;
  /** Optional desktop page-header control; shells with their own expansion control omit it. */
  SidebarControl: ComponentType | null;
  openMobileNavigation: () => void;
  /** The real hamburger remains the focus-return target for persistent mobile navigation. */
  mobileNavigationTriggerRef?: RefObject<HTMLButtonElement | null>;
  /** Closes temporary navigation, including child menus and mobile navigation. */
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
