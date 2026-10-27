import { createContext, useContext, type ReactNode } from "react";

/**
 * Where the one sidebar panel is currently rendered. The panel content is the
 * same everywhere; only a few controls differ (pin vs. close).
 */
export type SidebarSurface = "docked" | "overlay" | "sheet";

const SidebarSurfaceContext = createContext<SidebarSurface>("docked");

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
