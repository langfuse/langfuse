import { createContext, useContext, type ReactNode } from "react";

/**
 * The layout of the one persistent sidebar surface. Its content stays mounted
 * when desktop expansion or the viewport changes.
 */
export type SidebarSurface = "collapsed" | "expanded" | "mobile";

const SidebarSurfaceContext = createContext<SidebarSurface>("collapsed");

export function SidebarSurfaceProvider({
  surface,
  children,
}: {
  surface: SidebarSurface;
  children: ReactNode;
}) {
  return (
    <SidebarSurfaceContext.Provider value={surface}>
      {children}
    </SidebarSurfaceContext.Provider>
  );
}

export function useSidebarSurface(): SidebarSurface {
  return useContext(SidebarSurfaceContext);
}
