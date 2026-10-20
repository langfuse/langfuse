import { createContext, useContext, type ReactNode } from "react";

/**
 * Signals whether the real app navigation sidebar (`AppSidebar`) is mounted in
 * the current layout.
 *
 * Only `AuthenticatedLayout` mounts `AppSidebar`. The sidebar-less
 * `MinimalLayout` / `UnauthenticatedLayout` (public share views, auth pages)
 * leave this at its default `false`.
 *
 * Top-bar chrome that exists purely to mirror the sidebar — e.g. the mobile
 * `TopbarBrand` — reads this so it never renders on a page that has no sidebar
 * to mirror, regardless of which `PageHeader` props a given route happens to
 * set. That keeps the invariant in one place instead of relying on every
 * MinimalLayout-reachable caller to opt out.
 */
const SidebarPresenceContext = createContext(false);

export const SidebarPresenceProvider = ({
  children,
}: {
  children: ReactNode;
}) => (
  <SidebarPresenceContext.Provider value={true}>
    {children}
  </SidebarPresenceContext.Provider>
);

export const useHasAppSidebar = () => useContext(SidebarPresenceContext);
