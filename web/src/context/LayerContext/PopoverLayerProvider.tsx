import * as React from "react";

export const PopoverLayerContext = React.createContext<
  HTMLElement | null | undefined
>(undefined);

/** Keeps a modal's interactive popovers inside its accessibility subtree. */
export function PopoverLayerProvider({
  container,
  children,
}: PopoverLayerProviderProps) {
  return (
    <PopoverLayerContext.Provider value={container}>
      {children}
    </PopoverLayerContext.Provider>
  );
}

type PopoverLayerProviderProps = {
  container: HTMLElement | null;
  children: React.ReactNode;
};
