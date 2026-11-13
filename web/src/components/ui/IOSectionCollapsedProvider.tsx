import { createContext, use, type ReactNode } from "react";

const IOSectionCollapsedContext = createContext(false);

/** Sections inside start collapsed. The standalone trace page does not set it. */
export function IOSectionCollapsedProvider({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <IOSectionCollapsedContext.Provider value={collapsed}>
      {children}
    </IOSectionCollapsedContext.Provider>
  );
}

export function useIOSectionCollapsed() {
  return use(IOSectionCollapsedContext);
}
